<?php
declare(strict_types=1);

/**
 * Admin magic-link auth (email, one-time, expiring).
 *
 * - Generates a one-time token (never stored in DB).
 * - Stores only sha256(token) + expiry + "issued_host" binding.
 * - Consumes token exactly once (used_at is set atomically).
 *
 * Env (optional):
 * - O_ADMIN_MAGIC_TTL_MIN (default 15)
 * - O_ADMIN_MAGIC_MAIL_MODE = "mail" | "outbox" (default "mail")
 * - O_ADMIN_MAGIC_OUTBOX_DIR (default /data/magic_outbox)
 * - O_ADMIN_MAGIC_PUBLIC_HOST (optional; forces link host)
 * - O_ADMIN_MAGIC_REDIRECT (default "/#/HAUT")
 * - O_EMAIL_HASH_SALT (optional; salts email_hash logs)
 */

function canonical_host(string $raw): string {
    $h = trim($raw);
    if ($h === '') return '';
    // Handle X-Forwarded-Host format: "a, b"
    $h = trim(explode(',', $h, 2)[0]);
    $h = mb_strtolower($h);
    // Strip port (host:port)
    $h = preg_replace('/:\\d+$/', '', $h) ?: $h;
    return trim($h);
}

function request_public_host(): string {
    $xfh = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? '';
    if (is_string($xfh) && trim($xfh) !== '') return canonical_host($xfh);
    $hh = $_SERVER['HTTP_HOST'] ?? '';
    if (is_string($hh) && trim($hh) !== '') return canonical_host($hh);
    return '';
}

function request_public_scheme(): string {
    // index.php defines is_https_request(); reuse if present.
    if (function_exists('is_https_request') && is_https_request()) return 'https';
    return 'http';
}

function email_hash_for_log(string $email_norm): string {
    $salt = (string)(function_exists('env') ? env('O_EMAIL_HASH_SALT', '') : '');
    return hash('sha256', $email_norm . '|' . $salt);
}

function admin_magic_token(): string {
    $b = random_bytes(32);
    $s = base64_encode($b);
    // base64url
    $s = strtr($s, '+/', '-_');
    return rtrim($s, '=');
}

function admin_magic_token_hash(string $token): string {
    return hash('sha256', $token);
}

function ensure_admin_magic_schema(PDO $pdo): void {
    try {
        $driver = '';
        try {
            $driver = (string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        } catch (Throwable) {
            $driver = '';
        }

        if ($driver === 'sqlite') {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS admin_magic_links (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  email_hash TEXT NOT NULL,
                  token_hash TEXT NOT NULL,
                  issued_host TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  expires_at TEXT NOT NULL,
                  used_at TEXT NULL,
                  send_ok INTEGER NOT NULL DEFAULT 0,
                  send_error TEXT NULL,
                  used_ip TEXT NULL,
                  used_ua TEXT NULL
                )
            ");
            $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_hash ON admin_magic_links(token_hash)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_user_created ON admin_magic_links(user_id, created_at)");
            return;
        }

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS admin_magic_links (
              id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id INT UNSIGNED NOT NULL,
              email_hash CHAR(64) NOT NULL,
              token_hash CHAR(64) NOT NULL,
              issued_host VARCHAR(190) NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              expires_at DATETIME NOT NULL,
              used_at DATETIME NULL,
              send_ok BOOLEAN NOT NULL DEFAULT FALSE,
              send_error VARCHAR(64) NULL,
              used_ip VARCHAR(64) NULL,
              used_ua VARCHAR(190) NULL,
              UNIQUE KEY uniq_token_hash (token_hash),
              INDEX idx_user_created (user_id, created_at),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    } catch (Throwable) {
        // Ignore (rollout-safe). Schema is also applied via schema.sql in deploy.
    }
}

function ensure_user_for_email_admin(PDO $pdo, string $email_norm): int {
    // Returns existing user id or creates a minimal account (admin-only).
    $stmt = $pdo->prepare("SELECT id, status FROM users WHERE email = :e LIMIT 1");
    $stmt->execute([':e' => $email_norm]);
    $row = $stmt->fetch();
    if ($row) {
        $status = (string)($row['status'] ?? 'active');
        if ($status !== 'active') {
            // Keep it strict; admins must be active.
            return 0;
        }
        return (int)$row['id'];
    }

    // Create a new account with a random password hash (never used for daily auth).
    $pwd = bin2hex(random_bytes(24));
    $hash = password_hash($pwd, PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("INSERT INTO users (email, password_hash, status) VALUES (:e, :h, 'active')");
        $stmt->execute([':e' => $email_norm, ':h' => $hash]);
        $uid = (int)$pdo->lastInsertId();

        $handle = 'o.' . $uid;
        $comm = 'o+' . $uid . '@sowwwl.com';

        $pdo->prepare("INSERT INTO profiles (user_id, handle) VALUES (:u, :h)")
            ->execute([':u' => $uid, ':h' => $handle]);
        $pdo->prepare("INSERT INTO identities (user_id, comm_address) VALUES (:u, :c)")
            ->execute([':u' => $uid, ':c' => $comm]);
        $pdo->prepare("INSERT INTO ux_state (user_id, flip_seq) VALUES (:u, 0)")
            ->execute([':u' => $uid]);

        $pdo->commit();
        return $uid;
    } catch (Throwable) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return 0;
    }
}

function admin_magic_build_link(string $host, string $token): string {
    $scheme = request_public_scheme();
    $h = canonical_host($host);
    $q = rawurlencode($token);
    // Public path is /api/* (reverse proxy strips /api to API container).
    return "{$scheme}://{$h}/api/auth/admin/magic/verify?token={$q}";
}

function admin_magic_mail_mode(): string {
    $m = (string)(function_exists('env') ? env('O_ADMIN_MAGIC_MAIL_MODE', 'mail') : 'mail');
    $m = mb_strtolower(trim($m));
    if ($m === 'outbox') return 'outbox';
    return 'mail';
}

function admin_magic_outbox_dir(): string {
    $d = (string)(function_exists('env') ? env('O_ADMIN_MAGIC_OUTBOX_DIR', '/data/magic_outbox') : '/data/magic_outbox');
    $d = trim($d);
    return $d !== '' ? $d : '/data/magic_outbox';
}

function admin_magic_send_email(string $to, string $link, int $ttl_min): array {
    $mode = admin_magic_mail_mode();

    $subject = "O. — magic link (admin)";
    $body = "O.\n\nCe lien est à usage unique.\nExpire dans {$ttl_min} min.\n\n{$link}\n";

    if ($mode === 'outbox') {
        $dir = admin_magic_outbox_dir();
        try {
            if (!is_dir($dir)) @mkdir($dir, 0700, true);
            $id = bin2hex(random_bytes(8));
            $file = rtrim($dir, '/') . "/admin_magic_{$id}.json";
            $payload = [
                'to' => $to,
                'subject' => $subject,
                'created_at' => gmdate('c'),
                'ttl_min' => $ttl_min,
                'link' => $link,
                'body' => $body,
            ];
            $ok = @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            if ($ok === false) return [false, 'outbox_write_failed'];
            return [true, null];
        } catch (Throwable) {
            return [false, 'outbox_write_failed'];
        }
    }

    $from = (string)(function_exists('env') ? env('O_ADMIN_MAGIC_MAIL_FROM', 'no-reply@sowwwl.com') : 'no-reply@sowwwl.com');
    $headers = "From: {$from}\r\n" .
               "Content-Type: text/plain; charset=UTF-8\r\n";

    $ok = @mail($to, $subject, $body, $headers);
    if (!$ok) return [false, 'mail_failed'];
    return [true, null];
}

function admin_magic_ttl_min(): int {
    $raw = (string)(function_exists('env') ? env('O_ADMIN_MAGIC_TTL_MIN', '15') : '15');
    $n = (int)trim($raw);
    if ($n < 10) $n = 10;
    if ($n > 15) $n = 15;
    return $n;
}

function admin_magic_issue(PDO $pdo, string $email_norm, string $issued_host): array {
    ensure_admin_magic_schema($pdo);

    $uid = ensure_user_for_email_admin($pdo, $email_norm);
    if ($uid <= 0) return [false, 'user_create_failed', null];

    $ttl = admin_magic_ttl_min();
    $token = admin_magic_token();
    $token_hash = admin_magic_token_hash($token);
    $email_hash = email_hash_for_log($email_norm);
    $host = canonical_host($issued_host);
    if ($host === '') return [false, 'invalid_host', null];

    // Soft rate-limit: avoid repeated sends (per user).
    try {
        $stmt = $pdo->prepare("
            SELECT created_at
            FROM admin_magic_links
            WHERE user_id = :u
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute([':u' => $uid]);
        $last = $stmt->fetchColumn();
        if ($last) {
            $ts = strtotime((string)$last);
            if ($ts !== false && (time() - $ts) < 45) {
                return [false, 'rate_limited', null];
            }
        }
    } catch (Throwable) {
        // ignore
    }

    $expires_at = date('Y-m-d H:i:s', time() + $ttl * 60);
    $id = 0;
    try {
        $stmt = $pdo->prepare("
            INSERT INTO admin_magic_links (user_id, email_hash, token_hash, issued_host, expires_at, send_ok)
            VALUES (:u, :eh, :th, :h, :x, 0)
        ");
        $stmt->execute([
            ':u' => $uid,
            ':eh' => $email_hash,
            ':th' => $token_hash,
            ':h' => $host,
            ':x' => $expires_at,
        ]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable) {
        return [false, 'db_insert_failed', null];
    }

    $link = admin_magic_build_link($host, $token);
    [$sent, $send_err] = admin_magic_send_email($email_norm, $link, $ttl);

    try {
        if ($sent) {
            $pdo->prepare("UPDATE admin_magic_links SET send_ok = 1, send_error = NULL WHERE id = :id")->execute([':id' => $id]);
        } else {
            // Invalidate token immediately if we couldn't send it.
            $pdo->prepare("UPDATE admin_magic_links SET send_ok = 0, send_error = :e, used_at = CURRENT_TIMESTAMP WHERE id = :id")
                ->execute([':id' => $id, ':e' => $send_err ?: 'send_failed']);
        }
    } catch (Throwable) {
        // ignore
    }

    if (!$sent) return [false, 'send_failed', null];
    return [true, null, ['user_id' => $uid]];
}

function admin_magic_consume(PDO $pdo, string $token, string $host): array {
    ensure_admin_magic_schema($pdo);

    $t = trim($token);
    if ($t === '') return [false, 'invalid_token', null];
    if (mb_strlen($t) > 300) return [false, 'invalid_token', null];

    $host_now = canonical_host($host);
    if ($host_now === '') return [false, 'invalid_host', null];

    $th = admin_magic_token_hash($t);

    try {
        $stmt = $pdo->prepare("
            SELECT id, user_id, issued_host, expires_at, used_at, send_ok
            FROM admin_magic_links
            WHERE token_hash = :th
            LIMIT 1
        ");
        $stmt->execute([':th' => $th]);
        $row = $stmt->fetch();
    } catch (Throwable) {
        return [false, 'db_read_failed', null];
    }

    if (!$row) return [false, 'invalid_token', null];

    $issued_host = canonical_host((string)($row['issued_host'] ?? ''));
    if ($issued_host === '' || $issued_host !== $host_now) return [false, 'wrong_domain', null];

    if (!(bool)($row['send_ok'] ?? false)) return [false, 'send_failed', null];

    $used_at = $row['used_at'] ?? null;
    if ($used_at !== null && (string)$used_at !== '') return [false, 'used', null];

    $expires = (string)($row['expires_at'] ?? '');
    $ts = strtotime($expires);
    if ($ts !== false && $ts < time()) return [false, 'expired', null];

    $id = (int)($row['id'] ?? 0);
    $uid = (int)($row['user_id'] ?? 0);
    if ($id <= 0 || $uid <= 0) return [false, 'invalid_token', null];

    $ip = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
    $ip = trim(explode(',', $ip, 2)[0]);
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if (mb_strlen($ua) > 190) $ua = mb_substr($ua, 0, 190);

    // Consume atomically.
    try {
        $stmt = $pdo->prepare("
            UPDATE admin_magic_links
            SET used_at = CURRENT_TIMESTAMP, used_ip = :ip, used_ua = :ua
            WHERE id = :id AND used_at IS NULL
        ");
        $stmt->execute([':id' => $id, ':ip' => $ip, ':ua' => $ua]);
        if ($stmt->rowCount() !== 1) return [false, 'used', null];
    } catch (Throwable) {
        return [false, 'db_write_failed', null];
    }

    return [true, null, ['user_id' => $uid]];
}
