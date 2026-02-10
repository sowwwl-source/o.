<?php
declare(strict_types=1);

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

// host canonicalization
assert_eq(canonical_host('0.user.o.sowwwl.cloud:443'), '0.user.o.sowwwl.cloud', 'strip port');
assert_eq(canonical_host('EXAMPLE.COM'), 'example.com', 'lowercase');
assert_eq(canonical_host('a.com, b.com'), 'a.com', 'xfh first host');

// token shape
$t = admin_magic_token();
assert_true($t !== '', 'token not empty');
assert_true(strpos($t, '=') === false, 'token has no padding');
assert_true((bool)preg_match('/^[A-Za-z0-9\\-_]{30,}$/', $t), 'token is base64url');

$th = admin_magic_token_hash($t);
assert_true((bool)preg_match('/^[a-f0-9]{64}$/', $th), 'token hash is hex sha256');

$eh = email_hash_for_log('0wlslw0@protonmail.com');
assert_true((bool)preg_match('/^[a-f0-9]{64}$/', $eh), 'email hash is hex sha256');

// link keeps token in hash (not in server logs)
$link = admin_magic_build_link('0.user.o.sowwwl.cloud', $t);
assert_true(strpos($link, '/#/admin/magic/verify?token=') !== false, 'link path');

echo "ok\n";
