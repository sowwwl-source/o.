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

    // Attach door (identity-less) + ensure cour exists.
    try {
        $door = ensure_door($pdo, $uid);
        ensure_cour($pdo, $uid);
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
