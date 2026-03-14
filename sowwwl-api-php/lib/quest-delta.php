<?php
declare(strict_types=1);

require_once __DIR__ . '/land-theme.php';

function land_type_from_archetype(string $a): string {
    $norm = preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($a));
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

function quest_delta_accepts_step1_answer(string $answer): bool {
    $norm = mb_strtolower(preg_replace('/\s+/u', '', $answer));
    return $norm === 'delta' || $norm === 'δ';
}

function quest_delta_validate_beauty_text(string $answer): array {
    $wc = words_count($answer);
    if ($wc <= 0 || $wc > 9) {
        return ['ok' => false, 'error' => 'length', 'max_words' => 9];
    }
    return [
        'ok' => true,
        'text' => $answer,
        'score' => delta_coherence_score($answer),
    ];
}

function quest_delta_passage_choice_or_empty(string $answer): string {
    $norm = preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($answer));
    if ($norm === 'c' || str_starts_with($norm, 'culbu1on') || $norm === 'culbu1o' || str_starts_with($norm, 'culbu')) return 'culbu1on';
    if ($norm === 'd' || str_starts_with($norm, 'dur3rb') || str_starts_with($norm, 'dur3r')) return 'dur3rb';
    if ($norm === 'o' || str_starts_with($norm, 'tocu') || str_starts_with($norm, 't0cu')) return 'toCu';
    return '';
}

function quest_delta_seed_line_or_empty(string $answer): string {
    $line = ltrim($answer);
    if (!str_starts_with($line, 'O.')) return '';
    return $line;
}
