<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/land-theme.php';

function assert_eq($a, $b, string $label): void {
    if ($a === $b) return;
    fwrite(STDERR, "[FAIL] {$label}: expected " . var_export($b, true) . " got " . var_export($a, true) . "\n");
    exit(1);
}

$alpha = compute_land_theme('α');
assert_eq($alpha['glyph'], 'α', 'alpha glyph');
assert_eq($alpha['hue'], 0, 'alpha hue');
assert_eq($alpha['sat'], 22, 'alpha sat');
assert_eq($alpha['lum'], 92, 'alpha lum');
assert_eq($alpha['contrast'], 1.05, 'alpha contrast');
assert_eq($alpha['invertOnClick'], true, 'alpha invert');

$beta = compute_land_theme('β');
assert_eq($beta['hue'], 17, 'beta hue');
assert_eq($beta['sat'], 28, 'beta sat');
assert_eq($beta['lum'], 88, 'beta lum');
assert_eq($beta['contrast'], 1.08, 'beta contrast');

$delta = compute_land_theme('δ');
assert_eq($delta['hue'], 51, 'delta hue');
assert_eq($delta['sat'], 34, 'delta sat special');
assert_eq($delta['lum'], 76, 'delta lum special');
assert_eq($delta['contrast'], 1.24, 'delta contrast special');

$deltaUp = compute_land_theme('Δ');
assert_eq($deltaUp, $delta, 'delta uppercase stable');

$run1 = compute_land_theme('ω');
$run2 = compute_land_theme('ω');
assert_eq($run1, $run2, 'deterministic');

echo "ok\n";

