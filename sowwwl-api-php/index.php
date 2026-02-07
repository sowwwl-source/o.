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

    out(200, ['user' => $row, 'csrf' => $_SESSION['csrf']]);
}

if ($path === '/ux/threshold') {
    require_method('POST');
    require_csrf();

    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) out(401, ['guest' => true]);

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
