<?php
/**
 * sowwwl API — PHP (no vendor), session-based auth, JSON only.
 * Routes:
 *  - GET  /health
 *  - POST /auth/register
 *  - POST /auth/login
 *  - POST /auth/logout
 *  - GET  /me
 *
 * Deploy behind HTTPS (recommended). Works great behind a same-origin reverse proxy at /api/*.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Pragma: no-cache');
header('Expires: 0');

// ====== Basic hardening ======
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// ====== Minimal env loader (.env optional) ======
function load_env(string $file): void {
    if (!is_file($file)) return;
    $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        $pos = strpos($line, '=');
        if ($pos === false) continue;
        $k = trim(substr($line, 0, $pos));
        $v = trim(substr($line, $pos + 1));
        if ($k === '') continue;
        if ((str_starts_with($v, '"') && str_ends_with($v, '"')) || (str_starts_with($v, "'") && str_ends_with($v, "'"))) {
            $v = substr($v, 1, -1);
        }
        if (getenv($k) === false) {
            putenv($k . '=' . $v);
            $_ENV[$k] = $v;
        }
    }
}
load_env(__DIR__ . '/.env');

// Modules
require_once __DIR__ . '/lib/land-theme.php';
require_once __DIR__ . '/lib/bonuze.php';
require_once __DIR__ . '/lib/admin-magic.php';

// ====== Sessions ======
function is_https_request(): bool {
    $https = $_SERVER['HTTPS'] ?? '';
    if (!empty($https) && strtolower((string)$https) !== 'off') return true;

    // Common reverse-proxy headers (e.g. nginx/Caddy)
    $xfp = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    if (is_string($xfp) && $xfp !== '') {
        $proto = strtolower(trim(explode(',', $xfp, 2)[0]));
        if ($proto === 'https') return true;
    }
    $xfs = $_SERVER['HTTP_X_FORWARDED_SSL'] ?? '';
    if (is_string($xfs) && strtolower(trim($xfs)) === 'on') return true;

    return false;
}

ini_set('session.use_strict_mode', '1');
$secure = is_https_request();
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',      // keep empty; cookie binds to the current host (best with same-origin /api proxy)
    'secure' => $secure, // must be true in prod HTTPS
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// ====== Helpers ======
function json_input(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function out(int $code, array $payload): never {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $expected): void {
    global $method;
    if ($method !== $expected) out(405, ['error' => 'method_not_allowed']);
}

function require_csrf(): void {
    $h = $_SERVER['HTTP_X_CSRF'] ?? '';
    $s = (string)($_SESSION['csrf'] ?? '');
    if ($s === '' || !is_string($h) || !hash_equals($s, $h)) {
        out(403, ['error' => 'csrf']);
    }
}

function env(string $key, ?string $default = null): ?string {
    $v = $_ENV[$key] ?? getenv($key);
    if ($v === false || $v === null || $v === '') return $default;
    return (string)$v;
}

// ====== Roles (network admin) ======
function normalize_email(string $email): string {
    $e = trim(mb_strtolower($email));
    // Keep it simple; we only use it for equality checks against config.
    return $e;
}

function parse_csv_emails(?string $raw): array {
    $s = is_string($raw) ? trim($raw) : '';
    if ($s === '') return [];

    // Accept commas, spaces, newlines.
    $parts = preg_split('/[,\s]+/u', $s, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($parts)) return [];

    $out = [];
    foreach ($parts as $p) {
        $e = normalize_email((string)$p);
        if ($e === '') continue;
        $out[$e] = true;
    }
    return array_keys($out);
}

function network_admin_emails(): array {
    static $cache = null;
    if (is_array($cache)) return $cache;
    $cache = parse_csv_emails(env('O_NETWORK_ADMINS', ''));
    return $cache;
}

function is_network_admin_email(string $email): bool {
    $e = normalize_email($email);
    if ($e === '') return false;
    $admins = network_admin_emails();
    if (empty($admins)) return false;
    return in_array($e, $admins, true);
}

function require_network_admin(PDO $pdo, int $uid): void {
    try {
        $stmt = $pdo->prepare("SELECT email FROM users WHERE id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $email = $row ? (string)($row['email'] ?? '') : '';
    } catch (Throwable) {
        $email = '';
    }

    if (!is_network_admin_email($email)) out(403, ['error' => 'network_admin_required']);
}

// ====== DB ======
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $host = env('DB_HOST');
    $name = env('DB_NAME');
    $user = env('DB_USER');
    $pass = env('DB_PASS');
    $port = env('DB_PORT', '3306');

    if (!$host || !$name || !$user) out(500, ['error' => 'db_not_configured']);

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $user, (string)$pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return $pdo;
    } catch (Throwable $e) {
        out(500, ['error' => 'db_connection_failed']);
    }
}

// ====== CSRF (optional) ======
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

// ====== Auth helpers ======
function require_auth_uid(): int {
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);
    return $uid;
}

function normalize_pair(int $u1, int $u2): array {
    return $u1 < $u2 ? [$u1, $u2] : [$u2, $u1];
}

function resolve_user_target(PDO $pdo, string $target): int {
    $t = trim($target);
    if ($t === '' || mb_strlen($t) > 190) return 0;

    // Handle (profiles.handle)
    $stmt = $pdo->prepare("SELECT user_id FROM profiles WHERE handle = :t LIMIT 1");
    $stmt->execute([':t' => $t]);
    $row = $stmt->fetch();
    if ($row && isset($row['user_id'])) return (int)$row['user_id'];

    // Internal comm address (identities.comm_address)
    $stmt = $pdo->prepare("SELECT user_id FROM identities WHERE comm_address = :t LIMIT 1");
    $stmt->execute([':t' => $t]);
    $row = $stmt->fetch();
    if ($row && isset($row['user_id'])) return (int)$row['user_id'];

    // Email (users.email)
    if (str_contains($t, '@')) {
        $stmt = $pdo->prepare("SELECT id AS user_id FROM users WHERE email = :t LIMIT 1");
        $stmt->execute([':t' => strtolower($t)]);
        $row = $stmt->fetch();
        if ($row && isset($row['user_id'])) return (int)$row['user_id'];
    }

    // Numeric id (optional)
    if (ctype_digit($t)) {
        $stmt = $pdo->prepare("SELECT id AS user_id FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => (int)$t]);
        $row = $stmt->fetch();
        if ($row && isset($row['user_id'])) return (int)$row['user_id'];
    }

    return 0;
}

// ====== D0RS / presence / COUR helpers ======
function new_door_id(): string {
    return bin2hex(random_bytes(16));
}

function ensure_door(PDO $pdo, int $uid): array {
    try {
        $stmt = $pdo->prepare("SELECT door_id, tz_offset_min, lat_q, lon_q, updated_at FROM doors WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        if ($row && isset($row['door_id'])) return $row;
    } catch (Throwable) {
        // Table may not exist yet (during rollout); caller will handle.
    }

    for ($i = 0; $i < 4; $i++) {
        $door = new_door_id();
        try {
            $stmt = $pdo->prepare("INSERT INTO doors (user_id, door_id) VALUES (:u, :d)");
            $stmt->execute([':u' => $uid, ':d' => $door]);
            return ['door_id' => $door, 'tz_offset_min' => null, 'lat_q' => null, 'lon_q' => null, 'updated_at' => null];
        } catch (Throwable $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) continue;
            throw $e;
        }
    }

    // Last resort: re-select.
    $stmt = $pdo->prepare("SELECT door_id, tz_offset_min, lat_q, lon_q, updated_at FROM doors WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();
    return $row ?: ['door_id' => '', 'tz_offset_min' => null, 'lat_q' => null, 'lon_q' => null, 'updated_at' => null];
}

function ensure_cour(PDO $pdo, int $uid): void {
    try {
        $pdo->prepare("INSERT IGNORE INTO cour (user_id, content) VALUES (:u, '')")->execute([':u' => $uid]);
    } catch (Throwable) {
        // Rollout-safe: ignore if table isn't there yet.
    }
}

function ensure_land(PDO $pdo, int $uid): void {
    try {
        $pdo->prepare("INSERT IGNORE INTO land (user_id) VALUES (:u)")->execute([':u' => $uid]);
    } catch (Throwable) {
        // Rollout-safe: ignore if table isn't there yet.
    }
}

function land_table_has_column(PDO $pdo, string $col): bool {
    try {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'land'
              AND COLUMN_NAME = :c
            LIMIT 1
        ");
        $stmt->execute([':c' => $col]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable) {
        return false;
    }
}

function ensure_land_type_schema(PDO $pdo): void {
    try {
        if (!land_table_has_column($pdo, 'land_type')) {
            $pdo->exec("ALTER TABLE land ADD COLUMN land_type ENUM('A','B','C') NULL AFTER user_id");
        }
    } catch (Throwable) {
        // Ignore (rollout-safe).
    }
}

function ensure_land_state_schema(PDO $pdo): void {
    try {
        if (!land_table_has_column($pdo, 'lambda_val')) {
            $pdo->exec("ALTER TABLE land ADD COLUMN lambda_val DECIMAL(5,3) NULL AFTER land_type");
        }
        if (!land_table_has_column($pdo, 'beaute_text')) {
            $pdo->exec("ALTER TABLE land ADD COLUMN beaute_text MEDIUMTEXT NULL AFTER lambda_val");
        }
        if (!land_table_has_column($pdo, 'beaute_updated_at')) {
            $pdo->exec("ALTER TABLE land ADD COLUMN beaute_updated_at TIMESTAMP NULL AFTER beaute_text");
        }
    } catch (Throwable) {
        // Ignore (rollout-safe).
    }
}

function normalize_land_type(string $s): string {
    $t = strtoupper(trim($s));
    if ($t === 'A' || $t === 'B' || $t === 'C') return $t;
    return '';
}

function land_token_for_type(string $t): string {
    if ($t === 'A') return 'culbu1on';
    if ($t === 'B') return 'dur3rb';
    if ($t === 'C') return 'toCu';
    return '';
}

function land_type_from_archetype(string $a): string {
    $norm = mb_strtolower(preg_replace('/[^a-z0-9]+/u', '', $a));
    if ($norm === 'culbu1on' || str_starts_with($norm, 'culbu')) return 'A';
    if ($norm === 'dur3rb' || str_starts_with($norm, 'dur3r')) return 'B';
    if ($norm === 'tocu' || $norm === 't0cu' || str_starts_with($norm, 'toc')) return 'C';
    return '';
}

function greek_letter_or_empty(string $s): string {
    return normalize_greek_glyph($s);
}

function words_count(string $s): int {
    $t = trim($s);
    if ($t === '') return 0;
    $parts = preg_split('/\s+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
    return $parts ? count($parts) : 0;
}

function delta_coherence_score(string $s): float {
    // Coherence score (0..1): word_count + length + "no repeated chars" ratio.
    $t = trim($s);
    if ($t === '') return 0.0;

    $wc = words_count($t);
    $wordScore = min(1.0, max(0.0, $wc / 9.0));

    $chars = preg_replace('/\s+/u', '', $t);
    $arr = preg_split('//u', (string)$chars, -1, PREG_SPLIT_NO_EMPTY);
    $total = $arr ? count($arr) : 0;
    $uniq = $arr ? count(array_unique(array_map('mb_strtolower', $arr))) : 0;
    $uniqRatio = $total > 0 ? ($uniq / $total) : 0.0;

    $lenScore = $total > 0 ? min(1.0, $total / 60.0) : 0.0;

    $score = ($wordScore * 0.4) + ($lenScore * 0.3) + ($uniqRatio * 0.3);
    return (float)round(min(1.0, max(0.0, $score)), 3);
}

function bote_unlock_info(PDO $pdo, int $uid): array {
    try {
        $stmt = $pdo->prepare("SELECT unlock_until FROM bote_unlock WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $until = $row['unlock_until'] ?? null;
        $unlocked = false;
        if ($until) {
            $ts = strtotime((string)$until);
            $unlocked = ($ts !== false) && ($ts >= time());
        }
        return ['unlock_until' => $until, 'unlocked' => $unlocked];
    } catch (Throwable) {
        return ['unlock_until' => null, 'unlocked' => false];
    }
}

function seed_root_dir(): string {
    $base = env('SEED_ROOT', '/data');
    if (!$base) $base = '/data';
    return rtrim($base, '/');
}

function ensure_soul_schema(PDO $pdo): void {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS soul_cloud (
              user_id INT UNSIGNED PRIMARY KEY,
              token_sha256 CHAR(64) NOT NULL,
              token_hint VARCHAR(16) NOT NULL,
              config_json MEDIUMTEXT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS soul_uploads (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id INT UNSIGNED NOT NULL,
              archive_name VARCHAR(255) NOT NULL,
              archive_bytes BIGINT UNSIGNED NOT NULL,
              archive_sha256 CHAR(64) NOT NULL,
              archive_path VARCHAR(255) NOT NULL,
              manifest_json MEDIUMTEXT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_user_created (user_id, created_at),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    } catch (Throwable) {
        // Rollout-safe.
    }
}

function normalize_soul_token(string $s): string {
    return trim($s);
}

function validate_soul_token(string $token): array {
    $t = normalize_soul_token($token);
    $len = mb_strlen($t);
    if ($len < 6) return ['ok' => false, 'error' => 'token_too_short'];
    if ($len > 128) return ['ok' => false, 'error' => 'token_too_long'];
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $t)) return ['ok' => false, 'error' => 'token_bad_chars'];
    return ['ok' => true, 'token' => $t];
}

function soul_token_hint(string $token): string {
    $t = normalize_soul_token($token);
    if ($t === '') return '';
    $tail = mb_strlen($t) > 4 ? mb_substr($t, -4) : $t;
    return '…' . $tail;
}

function soul_token_sha256(string $token): string {
    return hash('sha256', normalize_soul_token($token));
}

function write_o_seed_file(int $uid, string $glyph, string $archetype, string $firstLine): array {
    $root = seed_root_dir();
    $dir = $root . '/0.users.O/' . $uid . '/seed';
    $path = $dir . '/O.seed.txt';

    $first = trim($firstLine);
    if (mb_strlen($first) > 320) $first = mb_substr($first, 0, 320);
    if (mb_strlen($archetype) > 64) $archetype = mb_substr($archetype, 0, 64);

    if (!is_dir($dir)) {
        @mkdir($dir, 0770, true);
    }

    $lines = [
        'O. ' . gmdate('c'),
        'glyph: ' . ($glyph !== '' ? $glyph : '—'),
        'archetype: ' . ($archetype !== '' ? $archetype : '—'),
        'b0te: ' . ($first !== '' ? $first : '—'),
    ];
    $content = implode("\n", $lines) . "\n";

    $ok = false;
    try {
        $ok = file_put_contents($path, $content, LOCK_EX) !== false;
    } catch (Throwable) {
        $ok = false;
    }

    return ['ok' => $ok, 'path' => $path];
}

function uid_from_door(PDO $pdo, string $door_id): int {
    $d = strtolower(trim($door_id));
    if ($d === '' || strlen($d) !== 32 || !ctype_xdigit($d)) return 0;
    $stmt = $pdo->prepare("SELECT user_id FROM doors WHERE door_id = :d LIMIT 1");
    $stmt->execute([':d' => $d]);
    $row = $stmt->fetch();
    return $row && isset($row['user_id']) ? (int)$row['user_id'] : 0;
}

function clamp_int(int $v, int $lo, int $hi): int {
    return min($hi, max($lo, $v));
}

function clamp_float(float $v, float $lo, float $hi): float {
    return min($hi, max($lo, $v));
}

function quantize_deg(?float $v, int $step, int $lo, int $hi): ?int {
    if ($v === null) return null;
    $vv = clamp_float($v, (float)$lo, (float)$hi);
    $q = (int)round($vv / $step) * $step;
    return clamp_int($q, $lo, $hi);
}

function door_noise(string $door_id, string $salt, int $span): int {
    if ($span <= 0) return 0;
    $h = hash('sha256', $door_id . '|' . $salt, true);
    $n = ord($h[0] ?? "\0");
    return ($n % ($span * 2 + 1)) - $span; // [-span..span]
}

function connection_request(PDO $pdo, int $uid, int $target_id): array {
    if ($target_id <= 0) return [404, ['error' => 'not_found']];
    if ($target_id === $uid) return [422, ['error' => 'self']];

    [$a, $b] = normalize_pair($uid, $target_id);

    $stmt = $pdo->prepare("SELECT id, requested_by, status, blocked_by FROM connections WHERE user_a = :a AND user_b = :b LIMIT 1");
    $stmt->execute([':a' => $a, ':b' => $b]);
    $row = $stmt->fetch();

    if ($row) {
        $status = (string)$row['status'];
        $blocked_by = $row['blocked_by'] !== null ? (int)$row['blocked_by'] : null;

        if ($status === 'blocked') return [403, ['error' => 'blocked', 'blocked_by' => $blocked_by]];
        if ($status === 'accepted') return [200, ['status' => 'accepted', 'link_id' => (int)$row['id']]];

        $requested_by = (int)$row['requested_by'];
        if ($requested_by === $uid) return [200, ['status' => 'pending', 'link_id' => (int)$row['id']]];

        // If a request already exists from the other side, accept immediately (handshake).
        $pdo->prepare("UPDATE connections SET status = 'accepted', blocked_by = NULL WHERE id = :id")
            ->execute([':id' => (int)$row['id']]);
        return [200, ['status' => 'accepted', 'link_id' => (int)$row['id']]];
    }

    $stmt = $pdo->prepare("INSERT INTO connections (user_a, user_b, requested_by, status) VALUES (:a, :b, :r, 'pending')");
    $stmt->execute([':a' => $a, ':b' => $b, ':r' => $uid]);
    return [201, ['status' => 'pending', 'link_id' => (int)$pdo->lastInsertId()]];
}

// ====== Routes ======
if ($path === '/health') {
    out(200, ['status' => 'ok']);
}

if ($path === '/auth/register') {
    require_method('POST');
    $in = json_input();

    $email = strtolower(trim((string)($in['email'] ?? '')));
    $password = (string)($in['password'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(422, ['error' => 'invalid_email']);
    if (mb_strlen($password) < 8) out(422, ['error' => 'password_too_short', 'min' => 8]);

    $pdo = db();

    $hash = password_hash($password, PASSWORD_DEFAULT);

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("INSERT INTO users (email, password_hash) VALUES (:e, :h)");
        $stmt->execute([':e' => $email, ':h' => $hash]);
        $uid = (int)$pdo->lastInsertId();

        $handle = 'o.' . $uid;
        $comm = 'o+' . $uid . '@sowwwl.com';

        $pdo->prepare("INSERT INTO profiles (user_id, handle) VALUES (:u, :h)")
            ->execute([':u' => $uid, ':h' => $handle]);

        $pdo->prepare("INSERT INTO identities (user_id, comm_address) VALUES (:u, :c)")
            ->execute([':u' => $uid, ':c' => $comm]);

        // Server-driven UX token (multi-device)
        $pdo->prepare("INSERT INTO ux_state (user_id, flip_seq) VALUES (:u, 0)")
            ->execute([':u' => $uid]);

        // D0RS + COUR (best-effort; rollout-safe)
        try {
            $door = new_door_id();
            $pdo->prepare("INSERT INTO doors (user_id, door_id) VALUES (:u, :d)")
                ->execute([':u' => $uid, ':d' => $door]);
            $pdo->prepare("INSERT INTO cour (user_id, content) VALUES (:u, '')")
                ->execute([':u' => $uid]);
        } catch (Throwable) {
            // Ignore; /me and /d0rs can lazy-create later.
        }

        $pdo->commit();

        session_regenerate_id(true);
        $_SESSION['uid'] = $uid;

        out(201, ['status' => 'created', 'user_id' => $uid, 'handle' => $handle, 'comm_address' => $comm]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // Duplicate email
        if (str_contains($e->getMessage(), 'Duplicate')) out(409, ['error' => 'email_exists']);
        out(500, ['error' => 'register_failed']);
    }
}

// ====== Admin magic-link (email) ======
if ($path === '/auth/admin/magic/send') {
    require_method('POST');
    $in = json_input();

    // Anti-enumeration: always respond OK to requests (even for non-admin / invalid emails).
    $email = strtolower(trim((string)($in['email'] ?? '')));
    $email = normalize_email($email);

    $expected = canonical_host((string)(env('O_ADMIN_MAGIC_PUBLIC_HOST', '') ?? ''));

    // For send, accept only from the expected host (prevents cross-domain spam).
    $reqHost = canonical_host((string)($_SERVER['HTTP_HOST'] ?? ''));
    if (trim($reqHost) === '') $reqHost = request_public_host();
    if ($expected !== '') {
        if ($reqHost === '' || $reqHost !== $expected) out(200, ['status' => 'ok']);
    }

    $host = $expected !== '' ? $expected : canonical_host($reqHost);

    if ($host !== '' && $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) && is_network_admin_email($email)) {
        $pdo = db();
        // Ignore errors for anti-enumeration; logs are kept in admin_magic_links.
        admin_magic_issue($pdo, $email, $host);
    }

    out(200, ['status' => 'ok']);
}

if ($path === '/auth/admin/magic/verify') {
    require_method('GET');
    $token = (string)($_GET['token'] ?? '');
    if (trim($token) === '') out(400, ['error' => 'invalid_token']);

    $pdo = db();
    $expected = canonical_host((string)(env('O_ADMIN_MAGIC_PUBLIC_HOST', '') ?? ''));
    // For verification, prefer the actual Host header to avoid trusting forwarded host values.
    $host = canonical_host((string)($_SERVER['HTTP_HOST'] ?? ''));
    if (trim($host) === '') $host = request_public_host();
    if ($expected !== '' && $host !== '' && $host !== $expected) {
        out(403, ['error' => 'wrong_domain', 'message' => 'Mauvais domaine.']);
    }
    [$ok, $err, $meta] = admin_magic_consume($pdo, $token, $host);
    if (!$ok) {
        $e = (string)$err;
        if ($e === 'wrong_domain') out(403, ['error' => 'wrong_domain', 'message' => 'Mauvais domaine.']);
        if ($e === 'expired') out(410, ['error' => 'expired', 'message' => 'Lien expiré.']);
        if ($e === 'used') out(410, ['error' => 'used', 'message' => 'Lien déjà utilisé.']);
        out(404, ['error' => 'invalid_link']);
    }

    $uid = (int)(is_array($meta) ? ($meta['user_id'] ?? 0) : 0);
    if ($uid <= 0) out(401, ['error' => 'denied']);

    // Re-check admin role at click-time (allows revocation by config).
    try {
        $stmt = $pdo->prepare("SELECT email, status FROM users WHERE id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $email = $row ? normalize_email((string)($row['email'] ?? '')) : '';
        $status = $row ? (string)($row['status'] ?? 'active') : '';
        if ($status !== 'active' || !is_network_admin_email($email)) {
            out(403, ['error' => 'network_admin_required']);
        }
    } catch (Throwable) {
        out(403, ['error' => 'network_admin_required']);
    }

    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;

    $to = (string)(env('O_ADMIN_MAGIC_REDIRECT', '/#/admin/b0ard') ?? '/#/admin/b0ard');
    if (trim($to) === '') $to = '/#/admin/b0ard';

    // Avoid JSON for the redirect response (browsers follow Location anyway).
    header('Content-Type: text/plain; charset=utf-8');
    header('Location: ' . $to, true, 302);
    echo "ok\n";
    exit;
}

if ($path === '/auth/login') {
    require_method('POST');
    $in = json_input();

    $email = strtolower(trim((string)($in['email'] ?? '')));
    $password = (string)($in['password'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(422, ['error' => 'invalid_email']);

    $pdo = db();
    $stmt = $pdo->prepare("SELECT id, password_hash, status FROM users WHERE email = :e");
    $stmt->execute([':e' => $email]);
    $user = $stmt->fetch();

    if (!$user) out(401, ['error' => 'denied']);
    if (($user['status'] ?? 'active') !== 'active') out(403, ['error' => 'user_not_active']);

    if (!password_verify($password, (string)$user['password_hash'])) {
        out(401, ['error' => 'denied']);
    }

    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$user['id'];
    out(200, ['status' => 'ok']);
}

if ($path === '/auth/logout') {
    require_method('POST');
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    out(200, ['status' => 'logged_out']);
}

if ($path === '/me') {
    require_method('GET');

    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);

    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT u.id, u.email, u.created_at,
               p.handle, p.display_name, p.state_o,
               i.comm_address, i.type, i.verified,
               COALESCE(ux.flip_seq, 0) AS flip_seq
        FROM users u
        JOIN profiles p ON p.user_id = u.id
        JOIN identities i ON i.user_id = u.id
        LEFT JOIN ux_state ux ON ux.user_id = u.id
        WHERE u.id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $uid]);
    $row = $stmt->fetch();

    if (!$row) out(401, ['guest' => true]);

    $row['network_admin'] = is_network_admin_email((string)($row['email'] ?? ''));

    // Attach door (identity-less) + ensure cour/land exists.
    try {
        $door = ensure_door($pdo, $uid);
        ensure_cour($pdo, $uid);
        ensure_land($pdo, $uid);
        if (!empty($door['door_id'])) {
            $row['door_id'] = (string)$door['door_id'];
            $row['tz_offset_min'] = $door['tz_offset_min'] ?? null;
            $row['lat_q'] = $door['lat_q'] ?? null;
            $row['lon_q'] = $door['lon_q'] ?? null;
        }
    } catch (Throwable) {
        // Rollout-safe: ignore.
    }

    out(200, ['user' => $row, 'csrf' => $_SESSION['csrf']]);
}

if ($path === '/land/theme') {
    require_method('GET');
    $uid = require_auth_uid();
    $pdo = db();

    ensure_land($pdo, $uid);

    $theme = getLandTheme($pdo, $uid);
    if (!$theme) {
        $stmt = $pdo->prepare("SELECT glyph FROM land WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $glyph = (string)($row['glyph'] ?? '');
        if ($glyph !== '') {
            $theme = applyLandGlyphTheme($pdo, $uid, $glyph);
        }
    }

    out(200, ['theme' => $theme]);
}

if ($path === '/land') {
    require_method('GET');
    $uid = require_auth_uid();
    $pdo = db();

    ensure_land($pdo, $uid);
    ensure_land_type_schema($pdo);
    ensure_land_state_schema($pdo);

    try {
        $stmt = $pdo->prepare("SELECT land_type, lambda_val, beaute_text, beaute_updated_at, glyph, o_seed_line, seal, updated_at FROM land WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
    } catch (Throwable) {
        $row = null;
    }

    $landType = normalize_land_type((string)($row['land_type'] ?? ''));
    out(200, [
        'created' => $landType !== '',
        'land' => [
            'land_type' => $landType !== '' ? $landType : null,
            'token' => $landType !== '' ? land_token_for_type($landType) : null,
            'lambda' => isset($row['lambda_val']) ? (float)$row['lambda_val'] : null,
            'beaute_text' => $row['beaute_text'] ?? null,
            'beaute_updated_at' => $row['beaute_updated_at'] ?? null,
            'glyph' => $row['glyph'] ?? null,
            'o_seed_line' => $row['o_seed_line'] ?? null,
            'seal' => $row['seal'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ],
    ]);
}

if ($path === '/land/create') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();
    $in = json_input();

    $t = normalize_land_type((string)($in['land_type'] ?? $in['type'] ?? $in['land'] ?? ''));
    if ($t === '') out(400, ['error' => 'invalid_land_type']);

    ensure_land($pdo, $uid);
    ensure_land_type_schema($pdo);

    $existing = '';
    try {
        $stmt = $pdo->prepare("SELECT land_type FROM land WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $existing = normalize_land_type((string)($row['land_type'] ?? ''));
    } catch (Throwable) {
        $existing = '';
    }

    if ($existing !== '') {
        out(409, ['error' => 'land_already_created', 'land_type' => $existing, 'token' => land_token_for_type($existing)]);
    }

    try {
        $pdo->prepare("UPDATE land SET land_type = :t WHERE user_id = :u")->execute([':t' => $t, ':u' => $uid]);
    } catch (Throwable) {
        out(500, ['error' => 'land_create_failed']);
    }

    out(200, ['ok' => true, 'land_type' => $t, 'token' => land_token_for_type($t)]);
}

if ($path === '/land/state') {
    if ($method === 'GET') {
        $uid = require_auth_uid();
        $pdo = db();

        ensure_land($pdo, $uid);
        ensure_land_type_schema($pdo);
        ensure_land_state_schema($pdo);

        $stmt = $pdo->prepare("SELECT land_type, lambda_val, beaute_text, beaute_updated_at FROM land WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch() ?: [];

        $landType = normalize_land_type((string)($row['land_type'] ?? ''));
        out(200, [
            'land_type' => $landType !== '' ? $landType : null,
            'lambda' => isset($row['lambda_val']) ? (float)$row['lambda_val'] : null,
            'beaute_text' => $row['beaute_text'] ?? null,
            'beaute_updated_at' => $row['beaute_updated_at'] ?? null,
        ]);
    }

    if ($method === 'POST') {
        $uid = require_auth_uid();
        require_csrf();
        $pdo = db();
        $in = json_input();

        ensure_land($pdo, $uid);
        ensure_land_type_schema($pdo);
        ensure_land_state_schema($pdo);

        $lambda = null;
        if (array_key_exists('lambda', $in)) {
            if (!is_numeric($in['lambda'])) out(422, ['error' => 'invalid_lambda']);
            $lambda = max(0.0, min(1.0, (float)$in['lambda']));
        }

        $beaute = null;
        if (array_key_exists('beaute_text', $in)) {
            $beaute = (string)$in['beaute_text'];
            if (mb_strlen($beaute) > 5000) out(413, ['error' => 'beaute_too_large']);
        }

        $fields = [];
        $params = [':u' => $uid];
        if ($lambda !== null) {
            $fields[] = "lambda_val = :l";
            $params[':l'] = $lambda;
        }
        if ($beaute !== null) {
            $fields[] = "beaute_text = :b";
            $fields[] = "beaute_updated_at = CURRENT_TIMESTAMP";
            $params[':b'] = $beaute;
        }
        if (!$fields) out(422, ['error' => 'no_changes']);

        $sql = "UPDATE land SET " . implode(', ', $fields) . " WHERE user_id = :u";
        $pdo->prepare($sql)->execute($params);

        out(200, ['ok' => true, 'lambda' => $lambda, 'beaute_text' => $beaute !== null ? $beaute : null]);
    }

    out(405, ['error' => 'method_not_allowed']);
}

// ====== b0n uZe (alphabetic equilibrium) ======
if ($path === '/bonuze/consent') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();
    $r = bonuze_accept($pdo, $uid);
    out(200, $r);
}

if ($path === '/bonuze/letter') {
    require_method('GET');
    $uid = require_auth_uid();
    $pdo = db();
    $r = bonuze_letter($pdo, $uid);
    out(200, $r);
}

if ($path === '/bonuze/event') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();
    $in = json_input();
    $type = strtolower(trim((string)($in['type'] ?? '')));
    $sig = (string)($in['sig'] ?? '');
    $weight = isset($in['weight']) ? (float)$in['weight'] : 1.0;
    if (!preg_match('/^[a-z0-9_-]{1,20}$/', $type)) out(422, ['error' => 'invalid_type']);
    if ($sig !== '' && mb_strlen($sig) > 64) $sig = mb_substr($sig, 0, 64);
    if ($weight <= 0 || $weight > 5) $weight = 1.0;
    $r = bonuze_event($pdo, $uid, ['type' => $type, 'sig' => $sig, 'weight' => $weight]);
    out($r['ok'] ? 200 : 403, $r);
}

// ====== Quest DELTA (4n0d3) ======
if ($path === '/quest/delta') {
    require_method('GET');
    $uid = require_auth_uid();
    $pdo = db();
    try {
        $stmt = $pdo->prepare("
            SELECT q.state, q.step, q.beauty_text, q.passage_choice, q.land_glyph, q.o_seed_line, q.seal, q.updated_at,
                   m.coherence_score
            FROM quest_delta q
            LEFT JOIN quest_delta_meta m ON m.user_id = q.user_id
            WHERE q.user_id = :u
            LIMIT 1
        ");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        if (!$row) {
            out(200, ['state' => 'IDLE', 'step' => 0, 'answers' => []]);
        }
        $answers = [
            'beauty_text' => $row['beauty_text'] ?? null,
            'coherence_score' => $row['coherence_score'] !== null ? (float)$row['coherence_score'] : null,
            'passage_choice' => $row['passage_choice'] ?? null,
            'land_glyph' => $row['land_glyph'] ?? null,
            'o_seed_line' => $row['o_seed_line'] ?? null,
            'seal' => $row['seal'] ?? null,
        ];
        out(200, [
            'state' => (string)$row['state'],
            'step' => (int)$row['step'],
            'answers' => $answers,
            'updated_at' => $row['updated_at'] ?? null,
        ]);
    } catch (Throwable) {
        out(200, ['state' => 'IDLE', 'step' => 0, 'answers' => []]);
    }
}

if ($path === '/quest/delta/start') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();
    try {
        $pdo->beginTransaction();

        $pdo->prepare("
            INSERT INTO quest_delta (user_id, state, step, beauty_text, passage_choice, land_glyph, o_seed_line, seal)
            VALUES (:u, 'RUNNING', 1, NULL, NULL, NULL, NULL, NULL)
            ON DUPLICATE KEY UPDATE
              state = 'RUNNING',
              step = 1,
              beauty_text = NULL,
              passage_choice = NULL,
              land_glyph = NULL,
              o_seed_line = NULL,
              seal = NULL,
              updated_at = CURRENT_TIMESTAMP
        ")->execute([':u' => $uid]);

        $pdo->prepare("DELETE FROM quest_delta_meta WHERE user_id = :u")->execute([':u' => $uid]);

        $pdo->commit();
        out(200, ['state' => 'RUNNING', 'step' => 1]);
    } catch (Throwable) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(500, ['error' => 'quest_start_failed']);
    }
}

if ($path === '/quest/delta/answer') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();
    $in = json_input();
    $answer = trim((string)($in['answer'] ?? ''));

    $stmt = $pdo->prepare("SELECT state, step FROM quest_delta WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();
    $state = (string)($row['state'] ?? 'IDLE');
    $step = (int)($row['step'] ?? 0);

    if ($state !== 'RUNNING' || $step <= 0) {
        out(409, ['error' => 'quest_not_running', 'state' => $state, 'step' => $step]);
    }

    if ($step === 1) {
        $norm = mb_strtolower(preg_replace('/\s+/u', '', $answer));
        if ($norm === 'delta' || $norm === 'δ') {
            $pdo->prepare("UPDATE quest_delta SET step = 2 WHERE user_id = :u")->execute([':u' => $uid]);
            out(200, ['ok' => true, 'step' => 2]);
        }
        out(200, ['ok' => false, 'step' => 1, 'hint' => 'Après α β γ…']);
    }

    if ($step === 2) {
        $wc = words_count($answer);
        if ($wc <= 0 || $wc > 9) {
            out(200, ['ok' => false, 'step' => 2, 'error' => 'length', 'max_words' => 9]);
        }
        $score = delta_coherence_score($answer);
        $pdo->prepare("UPDATE quest_delta SET beauty_text = :t, step = 3 WHERE user_id = :u")
            ->execute([':t' => $answer, ':u' => $uid]);
        $pdo->prepare("
            INSERT INTO quest_delta_meta (user_id, coherence_score) VALUES (:u, :s)
            ON DUPLICATE KEY UPDATE coherence_score = VALUES(coherence_score), updated_at = CURRENT_TIMESTAMP
        ")->execute([':u' => $uid, ':s' => $score]);
        out(200, ['ok' => true, 'step' => 3, 'score' => $score]);
    }

    if ($step === 3) {
        $norm = mb_strtolower(preg_replace('/[^a-z0-9]+/u', '', $answer));
        $choice = '';
        if ($norm === 'c' || str_starts_with($norm, 'culbu1on') || $norm === 'culbu1o' || str_starts_with($norm, 'culbu')) $choice = 'culbu1on';
        if ($norm === 'd' || str_starts_with($norm, 'dur3rb') || str_starts_with($norm, 'dur3r')) $choice = 'dur3rb';
        if ($norm === 'o' || str_starts_with($norm, 'tocu') || str_starts_with($norm, 't0cu')) $choice = 'toCu';
        if ($choice === '') out(200, ['ok' => false, 'step' => 3, 'error' => 'invalid_choice']);

        // Land type is structural: if a land type already exists, the archetype must match.
        $lt = land_type_from_archetype($choice);
        if ($lt !== '') {
            try {
                ensure_land($pdo, $uid);
                ensure_land_type_schema($pdo);
                $stmt = $pdo->prepare("SELECT land_type FROM land WHERE user_id = :u LIMIT 1");
                $stmt->execute([':u' => $uid]);
                $lrow = $stmt->fetch();
                $existing = normalize_land_type((string)($lrow['land_type'] ?? ''));
                if ($existing !== '' && $existing !== $lt) {
                    out(200, ['ok' => false, 'step' => 3, 'error' => 'land_type_conflict', 'land_type' => $existing]);
                }
                if ($existing === '') {
                    $pdo->prepare("UPDATE land SET land_type = :t WHERE user_id = :u")->execute([':t' => $lt, ':u' => $uid]);
                }
            } catch (Throwable) {
                // Ignore (rollout-safe).
            }
        }

        $pdo->prepare("UPDATE quest_delta SET passage_choice = :c, step = 4 WHERE user_id = :u")
            ->execute([':c' => $choice, ':u' => $uid]);
        out(200, ['ok' => true, 'step' => 4]);
    }

    if ($step === 4) {
        $g = greek_letter_or_empty($answer);
        if ($g === '') out(200, ['ok' => false, 'step' => 4, 'error' => 'invalid_glyph']);
        $pdo->prepare("UPDATE quest_delta SET land_glyph = :g, step = 5 WHERE user_id = :u")
            ->execute([':g' => $g, ':u' => $uid]);
        // Also write to land (best-effort)
        ensure_land($pdo, $uid);
        $pdo->prepare("UPDATE land SET glyph = :g WHERE user_id = :u")->execute([':g' => $g, ':u' => $uid]);
        out(200, ['ok' => true, 'step' => 5, 'glyph' => $g]);
    }

    if ($step === 5) {
        $line = ltrim($answer);
        if (!str_starts_with($line, 'O.')) {
            out(200, ['ok' => false, 'step' => 5, 'error' => 'must_start_with_O']);
        }
        $pdo->prepare("UPDATE quest_delta SET o_seed_line = :l WHERE user_id = :u")
            ->execute([':l' => $line, ':u' => $uid]);
        ensure_land($pdo, $uid);
        $pdo->prepare("UPDATE land SET o_seed_line = :l WHERE user_id = :u")->execute([':l' => $line, ':u' => $uid]);
        out(200, ['ok' => true, 'step' => 5, 'ready_to_end' => true]);
    }

    out(200, ['ok' => false, 'step' => $step]);
}

if ($path === '/quest/delta/end') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();

    $seal = 'Δ';
    $glyph = '';
    $theme = null;
    try {
        $stmt = $pdo->prepare("SELECT land_glyph FROM quest_delta WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $glyph = (string)($row['land_glyph'] ?? '');

        $pdo->prepare("UPDATE quest_delta SET state = 'ENDED', step = 0, seal = :s WHERE user_id = :u")
            ->execute([':s' => $seal, ':u' => $uid]);
    } catch (Throwable) {
        // Rollout-safe.
    }

    try {
        ensure_land($pdo, $uid);
        $pdo->prepare("UPDATE land SET seal = :s WHERE user_id = :u")
            ->execute([':s' => $seal, ':u' => $uid]);

        // Apply land theme (separate module). If glyph isn't set, do nothing.
        $g = normalize_greek_glyph($glyph);
        if ($g !== '') {
            $theme = applyLandGlyphTheme($pdo, $uid, $g);
        }
    } catch (Throwable) {
        // Ignore.
    }

    // Unlock B0te creation for 7 days.
    try {
        $pdo->prepare("
            INSERT INTO bote_unlock (user_id, unlock_until)
            VALUES (:u, DATE_ADD(NOW(), INTERVAL 7 DAY))
            ON DUPLICATE KEY UPDATE unlock_until = VALUES(unlock_until), updated_at = CURRENT_TIMESTAMP
        ")->execute([':u' => $uid]);
        $stmt = $pdo->prepare("SELECT unlock_until FROM bote_unlock WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $urow = $stmt->fetch();
        $unlockUntil = $urow['unlock_until'] ?? null;
    } catch (Throwable) {
        $unlockUntil = null;
    }

    // Trigger flip token (server-driven)
    try {
        $pdo->prepare("
            INSERT INTO ux_state (user_id, flip_seq) VALUES (:u, 1)
            ON DUPLICATE KEY UPDATE flip_seq = flip_seq + 1, updated_at = CURRENT_TIMESTAMP
        ")->execute([':u' => $uid]);
        $stmt = $pdo->prepare("SELECT flip_seq FROM ux_state WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $seq = (int)($row['flip_seq'] ?? 0);
        out(200, ['status' => 'ended', 'seal' => $seal, 'flip_seq' => $seq, 'theme' => $theme, 'bote_unlock_until' => $unlockUntil]);
    } catch (Throwable) {
        out(200, ['status' => 'ended', 'seal' => $seal, 'theme' => $theme, 'bote_unlock_until' => $unlockUntil]);
    }
}

if ($path === '/ux/threshold') {
    require_method('POST');

    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);
    require_csrf();

    $pdo = db();
    $stmt = $pdo->prepare("
        INSERT INTO ux_state (user_id, flip_seq) VALUES (:u, 1)
        ON DUPLICATE KEY UPDATE flip_seq = flip_seq + 1, updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([':u' => $uid]);

    $stmt = $pdo->prepare("SELECT flip_seq FROM ux_state WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();
    $seq = (int)($row['flip_seq'] ?? 0);

    out(200, ['status' => 'ok', 'flip_seq' => $seq]);
}

// ====== Links between people ======
if ($path === '/links') {
    require_method('GET');
    $uid = require_auth_uid();

    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT c.id, c.user_a, c.user_b, c.requested_by, c.status, c.blocked_by, c.created_at, c.updated_at,
               pa.handle AS a_handle, ia.comm_address AS a_comm, ia.verified AS a_verified,
               pb.handle AS b_handle, ib.comm_address AS b_comm, ib.verified AS b_verified,
               da.door_id AS a_door, db.door_id AS b_door
        FROM connections c
        JOIN profiles pa ON pa.user_id = c.user_a
        JOIN profiles pb ON pb.user_id = c.user_b
        JOIN identities ia ON ia.user_id = c.user_a AND ia.type = 'internal'
        JOIN identities ib ON ib.user_id = c.user_b AND ib.type = 'internal'
        LEFT JOIN doors da ON da.user_id = c.user_a
        LEFT JOIN doors db ON db.user_id = c.user_b
        WHERE c.user_a = :u OR c.user_b = :u
        ORDER BY c.updated_at DESC
    ");
    $stmt->execute([':u' => $uid]);
    $rows = $stmt->fetchAll();

    $links = [];
    foreach ($rows as $r) {
        $a = (int)$r['user_a'];
        $b = (int)$r['user_b'];
        $peer = $a === $uid ? $b : $a;

        $peer_handle = $a === $uid ? (string)$r['b_handle'] : (string)$r['a_handle'];
        $peer_comm = $a === $uid ? (string)$r['b_comm'] : (string)$r['a_comm'];
        $peer_verified = $a === $uid ? (int)$r['b_verified'] : (int)$r['a_verified'];
        $peer_door = $a === $uid ? (string)($r['b_door'] ?? '') : (string)($r['a_door'] ?? '');

        $status = (string)$r['status'];
        $requested_by = (int)$r['requested_by'];
        $blocked_by = $r['blocked_by'] !== null ? (int)$r['blocked_by'] : null;

        $direction = $status;
        if ($status === 'pending') {
            $direction = ($requested_by === $uid) ? 'outgoing' : 'incoming';
        }

        $links[] = [
            'id' => (int)$r['id'],
            'status' => $status,
            'direction' => $direction,
            'requested_by' => $requested_by,
            'blocked_by' => $blocked_by,
            'peer' => [
                'id' => $peer,
                'handle' => $peer_handle,
                'comm_address' => $peer_comm,
                'verified' => $peer_verified,
                'door_id' => $peer_door !== '' ? $peer_door : null,
            ],
            'created_at' => $r['created_at'],
            'updated_at' => $r['updated_at'],
        ];
    }

    out(200, ['links' => $links]);
}

if ($path === '/links/request') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $target = trim((string)($in['target'] ?? ''));
    if ($target === '' || mb_strlen($target) > 190) out(422, ['error' => 'invalid_target']);

    $pdo = db();
    $target_id = resolve_user_target($pdo, $target);
    [$code, $payload] = connection_request($pdo, $uid, $target_id);
    out($code, $payload);
}

if ($path === '/links/accept') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    if ($id <= 0) out(422, ['error' => 'invalid_id']);

    $pdo = db();
    $stmt = $pdo->prepare("SELECT id, user_a, user_b, requested_by, status, blocked_by FROM connections WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) out(404, ['error' => 'not_found']);

    $a = (int)$row['user_a'];
    $b = (int)$row['user_b'];
    if ($uid !== $a && $uid !== $b) out(404, ['error' => 'not_found']);

    $status = (string)$row['status'];
    if ($status === 'blocked') out(409, ['error' => 'blocked']);
    if ($status === 'accepted') out(200, ['status' => 'accepted', 'link_id' => $id]);
    if ($status !== 'pending') out(409, ['error' => 'bad_state']);

    $requested_by = (int)$row['requested_by'];
    if ($requested_by === $uid) out(403, ['error' => 'not_allowed']);

    $pdo->prepare("UPDATE connections SET status = 'accepted', blocked_by = NULL WHERE id = :id")
        ->execute([':id' => $id]);
    out(200, ['status' => 'accepted', 'link_id' => $id]);
}

if ($path === '/links/deny') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    if ($id <= 0) out(422, ['error' => 'invalid_id']);

    $pdo = db();
    $stmt = $pdo->prepare("SELECT id, user_a, user_b FROM connections WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) out(404, ['error' => 'not_found']);

    $a = (int)$row['user_a'];
    $b = (int)$row['user_b'];
    if ($uid !== $a && $uid !== $b) out(404, ['error' => 'not_found']);

    $pdo->prepare("DELETE FROM connections WHERE id = :id")->execute([':id' => $id]);
    out(200, ['status' => 'removed']);
}

if ($path === '/links/block') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    $target = trim((string)($in['target'] ?? ''));

    $pdo = db();

    if ($id > 0) {
        $stmt = $pdo->prepare("SELECT id, user_a, user_b FROM connections WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) out(404, ['error' => 'not_found']);
        $a = (int)$row['user_a'];
        $b = (int)$row['user_b'];
        if ($uid !== $a && $uid !== $b) out(404, ['error' => 'not_found']);

        $pdo->prepare("UPDATE connections SET status = 'blocked', blocked_by = :u WHERE id = :id")
            ->execute([':u' => $uid, ':id' => $id]);
        out(200, ['status' => 'blocked', 'link_id' => $id]);
    }

    if ($target === '' || mb_strlen($target) > 190) out(422, ['error' => 'invalid_target']);
    $target_id = resolve_user_target($pdo, $target);
    if ($target_id <= 0) out(404, ['error' => 'not_found']);
    if ($target_id === $uid) out(422, ['error' => 'self']);
    [$a, $b] = normalize_pair($uid, $target_id);

    $stmt = $pdo->prepare("SELECT id FROM connections WHERE user_a = :a AND user_b = :b LIMIT 1");
    $stmt->execute([':a' => $a, ':b' => $b]);
    $row = $stmt->fetch();
    if ($row) {
        $id = (int)$row['id'];
        $pdo->prepare("UPDATE connections SET status = 'blocked', blocked_by = :u WHERE id = :id")
            ->execute([':u' => $uid, ':id' => $id]);
        out(200, ['status' => 'blocked', 'link_id' => $id]);
    }

    $stmt = $pdo->prepare("
        INSERT INTO connections (user_a, user_b, requested_by, status, blocked_by)
        VALUES (:a, :b, :r, 'blocked', :u)
    ");
    $stmt->execute([':a' => $a, ':b' => $b, ':r' => $uid, ':u' => $uid]);
    out(201, ['status' => 'blocked', 'link_id' => (int)$pdo->lastInsertId()]);
}

if ($path === '/links/remove') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $id = (int)($in['id'] ?? 0);
    if ($id <= 0) out(422, ['error' => 'invalid_id']);

    $pdo = db();
    $stmt = $pdo->prepare("SELECT id, user_a, user_b FROM connections WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) out(404, ['error' => 'not_found']);

    $a = (int)$row['user_a'];
    $b = (int)$row['user_b'];
    if ($uid !== $a && $uid !== $b) out(404, ['error' => 'not_found']);

    $pdo->prepare("DELETE FROM connections WHERE id = :id")->execute([':id' => $id]);
    out(200, ['status' => 'removed']);
}

// ====== D0RS (public list) ======
if ($path === '/d0rs') {
    require_method('GET');
    $pdo = db();

    // Lazy-create doors for existing users (bounded).
    try {
        $stmt = $pdo->prepare("
            SELECT u.id
            FROM users u
            LEFT JOIN doors d ON d.user_id = u.id
            WHERE d.user_id IS NULL
            LIMIT 250
        ");
        $stmt->execute();
        $missing = $stmt->fetchAll();
        foreach ($missing as $m) {
            $mid = (int)($m['id'] ?? 0);
            if ($mid > 0) ensure_door($pdo, $mid);
        }
    } catch (Throwable) {
        // Ignore rollout hiccups.
    }

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 900;
    $limit = clamp_int($limit, 1, 2500);

    $stmt = $pdo->prepare("SELECT door_id, tz_offset_min, lat_q, lon_q, updated_at FROM doors ORDER BY updated_at DESC LIMIT :l");
    $stmt->bindValue(':l', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();

    $doors = [];
    foreach ($rows as $r) {
        $doors[] = [
            'door_id' => (string)($r['door_id'] ?? ''),
            'tz_offset_min' => $r['tz_offset_min'] !== null ? (int)$r['tz_offset_min'] : null,
            'lat_q' => $r['lat_q'] !== null ? (int)$r['lat_q'] : null,
            'lon_q' => $r['lon_q'] !== null ? (int)$r['lon_q'] : null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    out(200, ['doors' => $doors]);
}

if ($path === '/d0rs/me') {
    require_method('GET');
    $uid = require_auth_uid();

    $pdo = db();
    $door = ensure_door($pdo, $uid);
    ensure_cour($pdo, $uid);

    out(200, ['door' => $door]);
}

if ($path === '/d0rs/presence') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $pdo = db();
    $doorRow = ensure_door($pdo, $uid);
    $doorId = (string)($doorRow['door_id'] ?? '');

    $in = json_input();

    $fields = [];
    $params = [':u' => $uid];

    if (array_key_exists('tz_offset_min', $in)) {
        if (!is_numeric($in['tz_offset_min'])) out(422, ['error' => 'invalid_tz']);
        $tz = clamp_int((int)$in['tz_offset_min'], -720, 840);
        $fields[] = "tz_offset_min = :tz";
        $params[':tz'] = $tz;
    }

    if (array_key_exists('lat', $in)) {
        if ($in['lat'] !== null && !is_numeric($in['lat'])) out(422, ['error' => 'invalid_lat']);
        $lat = $in['lat'] === null ? null : (float)$in['lat'];
        $lat_q = quantize_deg($lat, 10, -80, 80);
        if ($lat_q !== null && $doorId !== '') {
            $lat_q = clamp_int($lat_q + (door_noise($doorId, 'lat', 1) * 10), -80, 80);
        }
        $fields[] = "lat_q = :lat";
        $params[':lat'] = $lat_q;
    }

    if (array_key_exists('lon', $in)) {
        if ($in['lon'] !== null && !is_numeric($in['lon'])) out(422, ['error' => 'invalid_lon']);
        $lon = $in['lon'] === null ? null : (float)$in['lon'];
        $lon_q = quantize_deg($lon, 10, -180, 180);
        if ($lon_q !== null && $doorId !== '') {
            $lon_q = clamp_int($lon_q + (door_noise($doorId, 'lon', 2) * 10), -180, 180);
        }
        $fields[] = "lon_q = :lon";
        $params[':lon'] = $lon_q;
    }

    if (!empty($fields)) {
        $sql = "UPDATE doors SET " . implode(', ', $fields) . " WHERE user_id = :u";
        $pdo->prepare($sql)->execute($params);
    }

    $door = ensure_door($pdo, $uid);
    out(200, ['status' => 'ok', 'door' => $door]);
}

if ($path === '/d0rs/knock') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $door = trim((string)($in['door_id'] ?? ''));
    if ($door === '' || strlen($door) !== 32) out(422, ['error' => 'invalid_door']);

    $pdo = db();
    $target_id = uid_from_door($pdo, $door);
    [$code, $payload] = connection_request($pdo, $uid, $target_id);
    out($code, $payload);
}

if ($path === '/d0rs/block') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $in = json_input();
    $door = trim((string)($in['door_id'] ?? ''));
    if ($door === '' || strlen($door) !== 32) out(422, ['error' => 'invalid_door']);

    $pdo = db();
    $target_id = uid_from_door($pdo, $door);
    if ($target_id <= 0) out(404, ['error' => 'not_found']);
    if ($target_id === $uid) out(422, ['error' => 'self']);

    [$a, $b] = normalize_pair($uid, $target_id);

    $stmt = $pdo->prepare("SELECT id FROM connections WHERE user_a = :a AND user_b = :b LIMIT 1");
    $stmt->execute([':a' => $a, ':b' => $b]);
    $row = $stmt->fetch();

    if ($row) {
        $id = (int)$row['id'];
        $pdo->prepare("UPDATE connections SET status = 'blocked', blocked_by = :u WHERE id = :id")
            ->execute([':u' => $uid, ':id' => $id]);
        out(200, ['status' => 'blocked', 'link_id' => $id]);
    }

    $stmt = $pdo->prepare("
        INSERT INTO connections (user_a, user_b, requested_by, status, blocked_by)
        VALUES (:a, :b, :r, 'blocked', :u)
    ");
    $stmt->execute([':a' => $a, ':b' => $b, ':r' => $uid, ':u' => $uid]);
    out(201, ['status' => 'blocked', 'link_id' => (int)$pdo->lastInsertId()]);
}

// ====== COUR (public personal space) ======
if ($path === '/cour') {
    if ($method === 'GET') {
        $door = trim((string)($_GET['door'] ?? ''));
        if ($door === '' || strlen($door) !== 32) out(422, ['error' => 'invalid_door']);

        $pdo = db();
        $stmt = $pdo->prepare("
            SELECT d.door_id, c.content, c.updated_at
            FROM doors d
            LEFT JOIN cour c ON c.user_id = d.user_id
            WHERE d.door_id = :d
            LIMIT 1
        ");
        $stmt->execute([':d' => strtolower($door)]);
        $row = $stmt->fetch();
        if (!$row) out(404, ['error' => 'not_found']);

        out(200, [
            'door_id' => (string)$row['door_id'],
            'cour' => [
                'content' => (string)($row['content'] ?? ''),
                'updated_at' => $row['updated_at'] ?? null,
            ],
        ]);
    }

    if ($method === 'POST') {
        $uid = require_auth_uid();
        require_csrf();

        $in = json_input();
        $content = (string)($in['content'] ?? '');
        if (mb_strlen($content) > 200_000) out(413, ['error' => 'content_too_large']);

        $pdo = db();
        ensure_door($pdo, $uid);
        ensure_cour($pdo, $uid);

        $stmt = $pdo->prepare("
            INSERT INTO cour (user_id, content) VALUES (:u, :c)
            ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([':u' => $uid, ':c' => $content]);

        out(200, ['status' => 'saved']);
    }

    out(405, ['error' => 'method_not_allowed']);
}

if ($path === '/cour/me') {
    require_method('GET');
    $uid = require_auth_uid();

    $pdo = db();
    $door = ensure_door($pdo, $uid);
    ensure_cour($pdo, $uid);

    $stmt = $pdo->prepare("SELECT content, updated_at FROM cour WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch() ?: ['content' => '', 'updated_at' => null];

    out(200, [
        'door_id' => (string)($door['door_id'] ?? ''),
        'cour' => [
            'content' => (string)($row['content'] ?? ''),
            'updated_at' => $row['updated_at'] ?? null,
        ],
    ]);
}

// ====== Qu3st (global quest text) ======
if ($path === '/qu3st') {
    $default = <<<'TXT'
          ┌───────────── montagne creuse ─────────────┐
          │                                           │
  [mer noire] ────• balise perdue ──┐                 │
                     │             │                 [tour veilleurs]
                 pont brisé        │                  │
                     │             │                  │
              brume dense       • camp de l'oeil ─────┘
                     │             │
                     ▼             │
               porte O. (fermée)   │
                     │             │
                • départ qu3st ────┘
                     │
                     ▼
                retour // O.
TXT;

    if ($method === 'GET') {
        $pdo = db();
        $row = null;
        try {
            $stmt = $pdo->prepare("SELECT content, updated_at FROM qu3st WHERE id = 1 LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch();
        } catch (Throwable) {
            $row = null;
        }

        $content = (string)($row['content'] ?? '');
        if ($content === '') $content = $default;

        out(200, [
            'qu3st' => [
                'content' => $content,
                'updated_at' => $row['updated_at'] ?? null,
            ],
        ]);
    }

    if ($method === 'POST') {
        $uid = require_auth_uid();
        require_csrf();

        $in = json_input();
        $content = (string)($in['content'] ?? '');
        if (mb_strlen($content) > 200_000) out(413, ['error' => 'content_too_large']);

        $pdo = db();
        require_network_admin($pdo, $uid);
        $stmt = $pdo->prepare("
            INSERT INTO qu3st (id, content) VALUES (1, :c)
            ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([':c' => $content]);

        out(200, ['status' => 'saved']);
    }

    out(405, ['error' => 'method_not_allowed']);
}

// ====== B0te (v2) ======
if ($path === '/bote/active') {
    require_method('GET');
    $uid = require_auth_uid();
    $pdo = db();

    $unlock = bote_unlock_info($pdo, $uid);

    $stmt = $pdo->prepare("
        SELECT status, languages, content, created_at, validated_at, expires_at, glyph, archetype, seed_path, first_line, updated_at
        FROM bote_entries
        WHERE user_id = :u
        LIMIT 1
    ");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();

    if ($row) {
        $status = (string)($row['status'] ?? '');
        $expires = $row['expires_at'] ?? null;
        if ($status === 'VISIBLE' && $expires) {
            $ts = strtotime((string)$expires);
            if ($ts !== false && $ts < time()) {
                $pdo->prepare("UPDATE bote_entries SET status = 'ARCHIVED' WHERE user_id = :u")->execute([':u' => $uid]);
                $row['status'] = 'ARCHIVED';
            }
        }
    }

    out(200, ['bote' => $row ?: null, 'unlock_until' => $unlock['unlock_until'], 'unlocked' => $unlock['unlocked']]);
}

if ($path === '/bote/start') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();

    $unlock = bote_unlock_info($pdo, $uid);
    if (!$unlock['unlocked']) out(403, ['error' => 'bote_locked', 'unlock_until' => $unlock['unlock_until']]);

    // Don't overwrite an active visible B0te.
    try {
        $stmt = $pdo->prepare("SELECT status, expires_at FROM bote_entries WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        if ($row && (string)($row['status'] ?? '') === 'VISIBLE') {
            $expires = $row['expires_at'] ?? null;
            $ts = $expires ? strtotime((string)$expires) : false;
            if ($ts === false || $ts >= time()) {
                out(409, ['error' => 'bote_already_visible', 'expires_at' => $expires]);
            }
        }
    } catch (Throwable) {
        // Ignore.
    }

    $in = json_input();
    $langs = $in['languages'] ?? null;
    $langStr = null;
    if (is_array($langs)) {
        $safe = [];
        foreach ($langs as $x) {
            $t = strtolower(trim((string)$x));
            if ($t === '' || mb_strlen($t) > 12) continue;
            if (!preg_match('/^[a-z0-9_-]+$/', $t)) continue;
            $safe[] = $t;
        }
        $safe = array_values(array_unique($safe));
        if ($safe) $langStr = implode(',', $safe);
    }

    $pdo->prepare("
        INSERT INTO bote_entries (user_id, status, languages, content, created_at, validated_at, expires_at, glyph, archetype, seed_path, first_line)
        VALUES (:u, 'DRAFT', :l, '', CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, NULL)
        ON DUPLICATE KEY UPDATE
          status = 'DRAFT',
          languages = VALUES(languages),
          content = '',
          created_at = CURRENT_TIMESTAMP,
          validated_at = NULL,
          expires_at = NULL,
          glyph = NULL,
          archetype = NULL,
          seed_path = NULL,
          first_line = NULL,
          updated_at = CURRENT_TIMESTAMP
    ")->execute([':u' => $uid, ':l' => $langStr]);

    $stmt = $pdo->prepare("SELECT status, languages, content, created_at, validated_at, expires_at, updated_at FROM bote_entries WHERE user_id = :u LIMIT 1");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();
    out(200, ['status' => 'started', 'bote' => $row, 'unlock_until' => $unlock['unlock_until']]);
}

if ($path === '/bote/validate') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();
    $pdo = db();

    $unlock = bote_unlock_info($pdo, $uid);
    if (!$unlock['unlocked']) out(403, ['error' => 'bote_locked', 'unlock_until' => $unlock['unlock_until']]);

    $in = json_input();
    $content = (string)($in['content'] ?? '');
    if (mb_strlen($content) > 200_000) out(413, ['error' => 'content_too_large']);

    $langs = $in['languages'] ?? null;
    $langStr = null;
    if (is_array($langs)) {
        $safe = [];
        foreach ($langs as $x) {
            $t = strtolower(trim((string)$x));
            if ($t === '' || mb_strlen($t) > 12) continue;
            if (!preg_match('/^[a-z0-9_-]+$/', $t)) continue;
            $safe[] = $t;
        }
        $safe = array_values(array_unique($safe));
        if ($safe) $langStr = implode(',', $safe);
    }

    $firstLine = '';
    $lines = preg_split("/\r?\n/u", $content);
    if ($lines) {
        foreach ($lines as $l) {
            $t = trim((string)$l);
            if ($t === '') continue;
            $firstLine = $t;
            break;
        }
    }

    // Pull glyph/archetype from Quest DELTA if available.
    $glyph = '';
    $archetype = '';
    try {
        $stmt = $pdo->prepare("SELECT land_glyph, passage_choice FROM quest_delta WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $q = $stmt->fetch();
        $glyph = normalize_greek_glyph((string)($q['land_glyph'] ?? ''));
        $archetype = (string)($q['passage_choice'] ?? '');
    } catch (Throwable) {
        $glyph = '';
        $archetype = '';
    }

    $seed = write_o_seed_file($uid, $glyph, $archetype, $firstLine);
    $seedPath = $seed['ok'] ? (string)$seed['path'] : null;

    $pdo->prepare("
        INSERT INTO bote_entries (user_id, status, languages, content, validated_at, expires_at, glyph, archetype, seed_path, first_line)
        VALUES (:u, 'VISIBLE', :l, :c, CURRENT_TIMESTAMP, DATE_ADD(NOW(), INTERVAL 7 DAY), :g, :a, :p, :f)
        ON DUPLICATE KEY UPDATE
          status = 'VISIBLE',
          languages = VALUES(languages),
          content = VALUES(content),
          validated_at = CURRENT_TIMESTAMP,
          expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY),
          glyph = VALUES(glyph),
          archetype = VALUES(archetype),
          seed_path = VALUES(seed_path),
          first_line = VALUES(first_line),
          updated_at = CURRENT_TIMESTAMP
    ")->execute([
        ':u' => $uid,
        ':l' => $langStr,
        ':c' => $content,
        ':g' => $glyph !== '' ? $glyph : null,
        ':a' => $archetype !== '' ? $archetype : null,
        ':p' => $seedPath,
        ':f' => $firstLine !== '' ? $firstLine : null,
    ]);

    $stmt = $pdo->prepare("
        SELECT status, languages, content, created_at, validated_at, expires_at, glyph, archetype, seed_path, first_line, updated_at
        FROM bote_entries
        WHERE user_id = :u
        LIMIT 1
    ");
    $stmt->execute([':u' => $uid]);
    $row = $stmt->fetch();

    out(200, [
        'status' => 'validated',
        'bote' => $row,
        'seed' => $seed,
        'unlock_until' => $unlock['unlock_until'],
    ]);
}

// ====== soul.cloud (token + upload, V0) ======
if ($path === '/soul/token') {
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);

    $pdo = db();
    ensure_soul_schema($pdo);

    if ($method === 'GET') {
        try {
            $stmt = $pdo->prepare("SELECT token_hint, config_json, updated_at FROM soul_cloud WHERE user_id = :u LIMIT 1");
            $stmt->execute([':u' => $uid]);
            $row = $stmt->fetch();
        } catch (Throwable) {
            $row = null;
        }

        if (!$row) out(200, ['token_set' => false]);

        $cfg = null;
        $cfgRaw = (string)($row['config_json'] ?? '');
        if ($cfgRaw !== '') {
            $decoded = json_decode($cfgRaw, true);
            if (is_array($decoded)) $cfg = $decoded;
        }

        out(200, [
            'token_set' => true,
            'token_hint' => (string)($row['token_hint'] ?? ''),
            'config' => $cfg,
            'updated_at' => $row['updated_at'] ?? null,
        ]);
    }

    if ($method === 'POST') {
        require_csrf();
        $in = json_input();

        $v = validate_soul_token((string)($in['token'] ?? ''));
        if (!$v['ok']) out(422, ['error' => $v['error']]);
        $token = (string)$v['token'];
        $hint = soul_token_hint($token);
        $sha = soul_token_sha256($token);

        $cfgJson = null;
        if (array_key_exists('config', $in)) {
            $cfgJson = json_encode($in['config'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($cfgJson === false) out(422, ['error' => 'invalid_config']);
            if (strlen($cfgJson) > 50_000) out(413, ['error' => 'config_too_large']);
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO soul_cloud (user_id, token_sha256, token_hint, config_json)
                VALUES (:u, :h, :hint, :cfg)
                ON DUPLICATE KEY UPDATE
                  token_sha256 = VALUES(token_sha256),
                  token_hint = VALUES(token_hint),
                  config_json = IFNULL(VALUES(config_json), config_json),
                  updated_at = CURRENT_TIMESTAMP
            ");
            $stmt->execute([':u' => $uid, ':h' => $sha, ':hint' => $hint, ':cfg' => $cfgJson]);
        } catch (Throwable) {
            out(500, ['error' => 'token_store_failed']);
        }

        out(200, ['ok' => true, 'token_hint' => $hint]);
    }

    out(405, ['error' => 'method_not_allowed']);
}

if ($path === '/soul/upload') {
    require_method('POST');
    $uid = require_auth_uid();
    require_csrf();

    $pdo = db();
    ensure_soul_schema($pdo);

    // Require token set (V0 contract).
    try {
        $stmt = $pdo->prepare("SELECT token_sha256 FROM soul_cloud WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        $hasToken = $row && !empty($row['token_sha256']);
    } catch (Throwable) {
        $hasToken = false;
    }
    if (!$hasToken) out(409, ['error' => 'token_required']);

    if (!isset($_FILES['archive'])) out(400, ['error' => 'missing_archive']);
    $f = $_FILES['archive'];
    if (!is_array($f)) out(400, ['error' => 'missing_archive']);

    $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err !== UPLOAD_ERR_OK) {
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) out(413, ['error' => 'upload_too_large']);
        if ($err === UPLOAD_ERR_PARTIAL) out(400, ['error' => 'upload_partial']);
        if ($err === UPLOAD_ERR_NO_FILE) out(400, ['error' => 'missing_archive']);
        out(400, ['error' => 'upload_failed', 'code' => $err]);
    }

    $tmp = (string)($f['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) out(422, ['error' => 'upload_invalid']);

    $size = (int)($f['size'] ?? 0);
    if ($size <= 0) out(422, ['error' => 'empty_archive']);

    $max = (int)(env('SOUL_UPLOAD_MAX_BYTES', '104857600') ?? '104857600'); // 100MB default
    if ($max > 0 && $size > $max) out(413, ['error' => 'upload_too_large', 'max_bytes' => $max]);

    // Basic ZIP sniff: must start with "PK"
    $sig = '';
    try {
        $fh = @fopen($tmp, 'rb');
        if ($fh !== false) {
            $sig = (string)(@fread($fh, 4) ?: '');
            @fclose($fh);
        }
    } catch (Throwable) {
        $sig = '';
    }
    if (strlen($sig) < 2 || $sig[0] !== 'P' || $sig[1] !== 'K') out(422, ['error' => 'not_zip']);

    $sha = hash_file('sha256', $tmp);
    if (!$sha) out(500, ['error' => 'hash_failed']);

    $orig = str_replace("\0", '', (string)($f['name'] ?? 'archive.zip'));
    $orig = trim($orig) !== '' ? trim($orig) : 'archive.zip';
    if (mb_strlen($orig) > 255) $orig = mb_substr($orig, 0, 255);

    $manifestJson = null;
    $rawManifest = (string)($_POST['manifest_json'] ?? '');
    if (trim($rawManifest) !== '') {
        if (strlen($rawManifest) > 1_000_000) out(413, ['error' => 'manifest_too_large']);
        $decoded = json_decode($rawManifest, true);
        if (!is_array($decoded)) out(422, ['error' => 'manifest_invalid']);
        $manifestJson = json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($manifestJson === false) out(422, ['error' => 'manifest_invalid']);
    }

    // Storage: /data (SEED_ROOT) / soul.cloud/<uid>/uploads/<key>-<sha>.zip
    $root = seed_root_dir();
    $dir = $root . '/soul.cloud/' . $uid . '/uploads';
    if (!is_dir($dir)) {
        @mkdir($dir, 0770, true);
    }
    if (!is_dir($dir)) out(500, ['error' => 'storage_unavailable']);

    $key = bin2hex(random_bytes(8));
    $file = $key . '-' . substr($sha, 0, 12) . '.zip';
    $rel = 'soul.cloud/' . $uid . '/uploads/' . $file;
    $dest = $root . '/' . $rel;

    try {
        $stmt = $pdo->prepare("
            INSERT INTO soul_uploads (user_id, archive_name, archive_bytes, archive_sha256, archive_path, manifest_json)
            VALUES (:u, :n, :b, :h, :p, :m)
        ");
        $stmt->execute([':u' => $uid, ':n' => $orig, ':b' => $size, ':h' => $sha, ':p' => $rel, ':m' => $manifestJson]);
        $uploadId = (int)$pdo->lastInsertId();
    } catch (Throwable) {
        out(500, ['error' => 'upload_store_failed']);
    }

    if (!@move_uploaded_file($tmp, $dest)) {
        try {
            $pdo->prepare("DELETE FROM soul_uploads WHERE id = :id AND user_id = :u")->execute([':id' => $uploadId, ':u' => $uid]);
        } catch (Throwable) {
            // Ignore.
        }
        out(500, ['error' => 'storage_write_failed']);
    }
    @chmod($dest, 0660);

    out(201, [
        'ok' => true,
        'upload_id' => $uploadId,
        'archive' => [
            'name' => $orig,
            'bytes' => $size,
            'sha256' => $sha,
        ],
        'stored' => [
            'scope' => 'soul.cloud',
            'path' => $rel,
            'manifest' => $manifestJson !== null,
        ],
    ]);
}

if ($path === '/bote/cleanup') {
    require_method('POST');
    $token = (string)($_SERVER['HTTP_X_CLEANUP_TOKEN'] ?? '');
    $expected = (string)(env('BOTE_CLEANUP_TOKEN', '') ?? '');
    if ($expected === '' || !hash_equals($expected, $token)) {
        out(403, ['error' => 'denied']);
    }
    $pdo = db();
    $stmt = $pdo->prepare("UPDATE bote_entries SET status = 'ARCHIVED' WHERE status = 'VISIBLE' AND expires_at IS NOT NULL AND expires_at < NOW()");
    $stmt->execute();
    out(200, ['status' => 'ok', 'archived' => $stmt->rowCount()]);
}

if ($path === '/bote') {
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);

    if ($method === 'GET') {
        $pdo = db();
        $stmt = $pdo->prepare("SELECT title, content, updated_at FROM botes WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        if (!$row) {
            out(200, ['bote' => ['title' => null, 'content' => '', 'updated_at' => null]]);
        }
        out(200, ['bote' => $row]);
    }

    if ($method === 'POST') {
        require_csrf();
        $in = json_input();
        $title = trim((string)($in['title'] ?? ''));
        $content = (string)($in['content'] ?? '');

        if ($title === '') $title = null;
        if (mb_strlen($content) > 200_000) out(413, ['error' => 'content_too_large']);

        $pdo = db();
        // One bote per user; UPSERT.
        $stmt = $pdo->prepare("
            INSERT INTO botes (user_id, title, content) VALUES (:u, :t, :c)
            ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([':u' => $uid, ':t' => $title, ':c' => $content]);

        out(200, ['status' => 'saved']);
    }

    out(405, ['error' => 'method_not_allowed']);
}

out(404, ['error' => 'not_found', 'path' => $path]);
