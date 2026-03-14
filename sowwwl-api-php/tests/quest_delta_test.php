<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/quest-delta.php';

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

assert_true(quest_delta_accepts_step1_answer(' δ '), 'step1 accepts greek delta');
assert_true(quest_delta_accepts_step1_answer('DeLtA'), 'step1 accepts delta word');
assert_true(!quest_delta_accepts_step1_answer('delta plus'), 'step1 rejects extra words');

$valid = quest_delta_validate_beauty_text('un pli calme');
assert_eq($valid['ok'], true, 'step2 valid');
assert_eq($valid['text'], 'un pli calme', 'step2 preserves text');
assert_true(is_float($valid['score']) && $valid['score'] > 0.0 && $valid['score'] <= 1.0, 'step2 score range');

$invalid = quest_delta_validate_beauty_text('un deux trois quatre cinq six sept huit neuf dix');
assert_eq($invalid['ok'], false, 'step2 rejects long text');
assert_eq($invalid['error'], 'length', 'step2 error length');
assert_eq($invalid['max_words'], 9, 'step2 max words');

assert_eq(quest_delta_passage_choice_or_empty('c'), 'culbu1on', 'step3 c shortcut');
assert_eq(quest_delta_passage_choice_or_empty('dur3rb'), 'dur3rb', 'step3 d token');
assert_eq(quest_delta_passage_choice_or_empty('O'), 'toCu', 'step3 o shortcut');
assert_eq(quest_delta_passage_choice_or_empty('???'), '', 'step3 invalid');

assert_eq(quest_delta_seed_line_or_empty('  O. seed'), 'O. seed', 'step5 trims left padding');
assert_eq(quest_delta_seed_line_or_empty('seed'), '', 'step5 rejects missing prefix');

assert_true(delta_coherence_score('un pli calme') > delta_coherence_score('aaaa aaaa'), 'coherence rewards variety');
assert_eq(land_type_from_archetype('toCu'), 'C', 'land type inference');
assert_eq(greek_letter_or_empty('Δ'), 'δ', 'glyph normalization');

echo "ok\n";
