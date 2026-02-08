<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bonuze.php';

function assert_eq($a, $b, string $label): void {
    if ($a === $b) return;
    fwrite(STDERR, "[FAIL] {$label}: expected " . var_export($b, true) . " got " . var_export($a, true) . "\n");
    exit(1);
}

// Alphabet mapping
assert_eq(bonuze_letter_from_index(14), 'O', 'center is O');
assert_eq(bonuze_letter_from_index(0), 'A', 'index 0');
assert_eq(bonuze_letter_from_index(25), 'Z', 'index 25');
assert_eq(bonuze_index_from_letter('O'), 14, 'O index');
assert_eq(bonuze_index_from_letter('z'), 25, 'Z index');

// Decay behavior
$v = bonuze_decay_value(10.0, 0.0, 60.0);
assert_eq($v, 10.0, 'no decay with zero dt');
$v = bonuze_decay_value(10.0, 60.0, 60.0);
assert_eq($v, 0.0, 'full decay at window');
$v = bonuze_decay_value(10.0, 30.0, 60.0);
assert_eq(round($v, 2), 5.0, 'half decay at half window');

echo "ok\n";

