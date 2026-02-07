<?php
declare(strict_types=1);

/**
 * Land theme module (glyph -> deterministic colorimetry).
 *
 * Public API:
 *  - normalize_greek_glyph(string): string
 *  - compute_land_theme(string): array{glyph:string,hue:int,sat:int,lum:int,contrast:float,invertOnClick:bool}
 *  - applyLandGlyphTheme(PDO,int,string): array (same as compute + persistence)
 *  - getLandTheme(PDO,int): ?array
 */

function normalize_greek_glyph(string $s): string {
    $t = trim($s);
    if ($t === '') return '';
    $ch = mb_substr($t, 0, 1);

    $low = mb_strtolower($ch);
    $up = mb_strtoupper($ch);

    $lower = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
    $upper = ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'];

    $idx = array_search($low, $lower, true);
    if ($idx !== false) return $lower[(int)$idx];

    $idx = array_search($up, $upper, true);
    if ($idx !== false) return $lower[(int)$idx];

    return '';
}

function compute_land_theme(string $glyph): array {
    $g = normalize_greek_glyph($glyph);
    if ($g === '') {
        return [
            'glyph' => '',
            'hue' => 0,
            'sat' => 0,
            'lum' => 0,
            'contrast' => 1.0,
            'invertOnClick' => true,
        ];
    }

    $alphabet = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω'];
    $index = array_search($g, $alphabet, true);
    $i = $index === false ? 0 : (int)$index;

    $hue = ($i * 17) % 360;
    $sat = 22 + ($i % 5) * 6;
    $lum = 92 - ($i % 7) * 4;
    $contrast = 1.05 + ($i % 6) * 0.03;
    $invertOnClick = true;

    // Special-case delta (archaeological): more contrast, slightly less saturation.
    if ($g === 'δ') {
        $sat = max(0, $sat - 6);
        $contrast += 0.10;
        $lum = max(0, $lum - 4);
    }

    return [
        'glyph' => $g,
        'hue' => (int)$hue,
        'sat' => (int)$sat,
        'lum' => (int)$lum,
        'contrast' => (float)round($contrast, 3),
        'invertOnClick' => (bool)$invertOnClick,
    ];
}

function getLandTheme(PDO $pdo, int $uid): ?array {
    if ($uid <= 0) return null;
    try {
        $stmt = $pdo->prepare("SELECT glyph, hue, sat, lum, contrast, invert_on_click, theme_updated_at FROM land_theme WHERE user_id = :u LIMIT 1");
        $stmt->execute([':u' => $uid]);
        $row = $stmt->fetch();
        if (!$row) return null;
        return [
            'glyph' => (string)$row['glyph'],
            'hue' => (int)$row['hue'],
            'sat' => (int)$row['sat'],
            'lum' => (int)$row['lum'],
            'contrast' => (float)$row['contrast'],
            'invertOnClick' => (bool)$row['invert_on_click'],
            'theme_updated_at' => $row['theme_updated_at'] ?? null,
        ];
    } catch (Throwable) {
        return null;
    }
}

function applyLandGlyphTheme(PDO $pdo, int $uid, string $glyph): array {
    if ($uid <= 0) return compute_land_theme('');
    $theme = compute_land_theme($glyph);
    if ($theme['glyph'] === '') return $theme;

    // Ensure a land row exists, then persist glyph + derived theme.
    $pdo->prepare("INSERT IGNORE INTO land (user_id) VALUES (:u)")->execute([':u' => $uid]);
    $pdo->prepare("UPDATE land SET glyph = :g WHERE user_id = :u")->execute([':g' => $theme['glyph'], ':u' => $uid]);

    $pdo->prepare("
        INSERT INTO land_theme (user_id, glyph, hue, sat, lum, contrast, invert_on_click)
        VALUES (:u, :g, :h, :s, :l, :c, :i)
        ON DUPLICATE KEY UPDATE
          glyph = VALUES(glyph),
          hue = VALUES(hue),
          sat = VALUES(sat),
          lum = VALUES(lum),
          contrast = VALUES(contrast),
          invert_on_click = VALUES(invert_on_click),
          theme_updated_at = CURRENT_TIMESTAMP
    ")->execute([
        ':u' => $uid,
        ':g' => $theme['glyph'],
        ':h' => $theme['hue'],
        ':s' => $theme['sat'],
        ':l' => $theme['lum'],
        ':c' => $theme['contrast'],
        ':i' => $theme['invertOnClick'] ? 1 : 0,
    ]);

    return $theme;
}

