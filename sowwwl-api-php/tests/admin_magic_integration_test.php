<?php
declare(strict_types=1);

// Minimal env shim for the library (index.php defines env(), tests don't).
function env(string $key, ?string $default = null): ?string {
    $v = $_ENV[$key] ?? getenv($key);
    if ($v === false || $v === null || $v === '') return $default;
    return (string)$v;
}

require_once __DIR__ . '/../lib/admin-magic.php';

function assert_true($cond, string $label): void {
    if ($cond) return;
    fwrite(STDERR, "[FAIL] {$label}\n");
    exit(1);
}

function assert_eq($a, $b, string $label): void {
    if ($a === $b) return;
    fwrite(STDERR, "[FAIL] {$label}: expected " . var_export($b, true) . " got " . var_export($a, true) . "\n");
    exit(1);
}

function mkTmpDir(string $prefix): string {
    $base = rtrim(sys_get_temp_dir(), '/');
    $dir = $base . '/' . $prefix . '_' . bin2hex(random_bytes(6));
    if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
        fwrite(STDERR, "[FAIL] tmpdir\n");
        exit(1);
    }
    return $dir;
}

function listJsonFiles(string $dir): array {
    $out = [];
    foreach (glob(rtrim($dir, '/') . '/*.json') ?: [] as $f) {
        $out[] = $f;
    }
    sort($out);
    return $out;
}

function readOutboxLink(string $dir): string {
    $files = listJsonFiles($dir);
    assert_true(count($files) >= 1, 'outbox has file');
    // Deterministic: pick most recently modified file (names are random).
    $best = null;
    $bestM = -1;
    foreach ($files as $f) {
        $m = @filemtime($f);
        $m = $m === false ? 0 : (int)$m;
        if ($m >= $bestM) {
            $bestM = $m;
            $best = $f;
        }
    }
    $raw = file_get_contents((string)$best);
    assert_true($raw !== false, 'outbox readable');
    $data = json_decode((string)$raw, true);
    assert_true(is_array($data), 'outbox json');
    $link = (string)($data['link'] ?? '');
    assert_true($link !== '', 'outbox link');
    return $link;
}

function clearOutbox(string $dir): void {
    foreach (listJsonFiles($dir) as $f) {
        @unlink($f);
    }
}

function tokenFromLink(string $url): string {
    $parts = parse_url($url);
    $q = $parts['query'] ?? '';
    parse_str((string)$q, $params);
    $t = (string)($params['token'] ?? '');
    assert_true($t !== '', 'token in link');
    return $t;
}

function makePdo(): PDO {
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    return $pdo;
}

function installSchema(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ");
    $pdo->exec("
        CREATE TABLE profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          handle TEXT UNIQUE NOT NULL,
          display_name TEXT NULL,
          state_o TEXT DEFAULT '0'
        )
    ");
    $pdo->exec("
        CREATE TABLE identities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          comm_address TEXT UNIQUE NOT NULL,
          type TEXT DEFAULT 'internal',
          verified INTEGER DEFAULT 0
        )
    ");
    $pdo->exec("
        CREATE TABLE ux_state (
          user_id INTEGER PRIMARY KEY,
          flip_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ");
}

function touchOlder(PDO $pdo): void {
    // Avoid rate-limit for repeated issues in tests.
    $pdo->exec("UPDATE admin_magic_links SET created_at = '2000-01-01 00:00:00'");
}

// ===== Test setup =====
$_ENV['O_ADMIN_MAGIC_MAIL_MODE'] = 'outbox';
putenv('O_ADMIN_MAGIC_MAIL_MODE=outbox');
$_ENV['O_ADMIN_MAGIC_TTL_MIN'] = '15';
putenv('O_ADMIN_MAGIC_TTL_MIN=15');

$outbox = mkTmpDir('o_admin_magic_outbox');
$_ENV['O_ADMIN_MAGIC_OUTBOX_DIR'] = $outbox;
putenv('O_ADMIN_MAGIC_OUTBOX_DIR=' . $outbox);

$pdo = makePdo();
installSchema($pdo);

$email = '0wlslw0@protonmail.com';
$hostGood = '0.user.o.sowwwl.cloud';
$hostBad = 'sowwwl.com';
// Used to validate forced host behavior.
$hostForced = '0.user.o.sowwwl.cloud';

// 1) Envoi réussi → mail (outbox) → clic (consume) → OK
clearOutbox($outbox);
[$ok, $err] = admin_magic_issue($pdo, $email, $hostGood);
assert_eq($ok, true, 'issue ok');
assert_eq($err, null, 'issue err null');

$link = readOutboxLink($outbox);
$token = tokenFromLink($link);

[$ok2, $err2, $meta2] = admin_magic_consume($pdo, $token, $hostGood);
assert_eq($ok2, true, 'consume ok');
assert_eq($err2, null, 'consume err null');
assert_true(is_array($meta2) && (int)($meta2['user_id'] ?? 0) > 0, 'consume user_id');

// Session is created by the route (index.php). Here we validate user binding:
$uid = (int)$meta2['user_id'];
$stmt = $pdo->prepare("SELECT email FROM users WHERE id = :u LIMIT 1");
$stmt->execute([':u' => $uid]);
$row = $stmt->fetch();
assert_eq((string)($row['email'] ?? ''), $email, 'user email matches');

// 3) Lien déjà utilisé → refus
[$ok3, $err3] = admin_magic_consume($pdo, $token, $hostGood);
assert_eq($ok3, false, 'consume used ok=false');
assert_eq($err3, 'used', 'consume used err');

// 2) Lien expiré → refus
touchOlder($pdo);
clearOutbox($outbox);
[$okE, $errE] = admin_magic_issue($pdo, $email, $hostGood);
assert_eq($okE, true, 'issue2 ok');
$tokenE = tokenFromLink(readOutboxLink($outbox));

// Expire it explicitly.
$pdo->prepare("UPDATE admin_magic_links SET expires_at = '2000-01-01 00:00:00' WHERE token_hash = :h")
    ->execute([':h' => admin_magic_token_hash($tokenE)]);

[$okE2, $errE2] = admin_magic_consume($pdo, $tokenE, $hostGood);
assert_eq($okE2, false, 'expired ok=false');
assert_eq($errE2, 'expired', 'expired err');

// 4) Mauvais domaine → refus
touchOlder($pdo);
clearOutbox($outbox);
[$okD, $errD] = admin_magic_issue($pdo, $email, $hostGood);
assert_eq($okD, true, 'issue3 ok');
$tokenD = tokenFromLink(readOutboxLink($outbox));

[$okD2, $errD2] = admin_magic_consume($pdo, $tokenD, $hostBad);
assert_eq($okD2, false, 'wrong domain ok=false');
assert_eq($errD2, 'wrong_domain', 'wrong domain err');

// Extra: email not sent → send_failed (outbox path unwritable)
touchOlder($pdo);
$badPath = $outbox . '/not_a_dir';
file_put_contents($badPath, 'x'); // make it a file, so writes to "$badPath/..." fail.
$_ENV['O_ADMIN_MAGIC_OUTBOX_DIR'] = $badPath;
putenv('O_ADMIN_MAGIC_OUTBOX_DIR=' . $badPath);

[$okS, $errS] = admin_magic_issue($pdo, $email, $hostGood);
assert_eq($okS, false, 'send fail ok=false');
assert_eq($errS, 'send_failed', 'send fail err');

// Forced public host (mitigates host header injection; stable links).
touchOlder($pdo);
$_ENV['O_ADMIN_MAGIC_OUTBOX_DIR'] = $outbox;
putenv('O_ADMIN_MAGIC_OUTBOX_DIR=' . $outbox);
$_ENV['O_ADMIN_MAGIC_PUBLIC_HOST'] = $hostForced;
putenv('O_ADMIN_MAGIC_PUBLIC_HOST=' . $hostForced);

clearOutbox($outbox);
[$okF, $errF] = admin_magic_issue($pdo, $email, $hostBad);
assert_eq($okF, true, 'issue forced ok');
assert_eq($errF, null, 'issue forced err null');

$linkF = readOutboxLink($outbox);
assert_true(strpos($linkF, $hostForced) !== false, 'link uses forced host');
$tokenF = tokenFromLink($linkF);

// Wrong domain should refuse (even if token exists).
[$okF0, $errF0] = admin_magic_consume($pdo, $tokenF, $hostBad);
assert_eq($okF0, false, 'forced wrong domain ok=false');
assert_eq($errF0, 'wrong_domain', 'forced wrong domain err');

// Correct domain should succeed.
[$okF2, $errF2] = admin_magic_consume($pdo, $tokenF, $hostForced);
assert_eq($okF2, true, 'forced consume ok');
assert_eq($errF2, null, 'forced consume err null');

echo "ok\n";
