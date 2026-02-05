<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$archivePath = __DIR__ . '/archive.json';
$items = [];

if (is_file($archivePath)) {
    $contents = file_get_contents($archivePath);
    if ($contents) {
        $decoded = json_decode($contents, true);
        if (is_array($decoded)) $items = $decoded;
    }
}

echo json_encode(['ok' => true, 'items' => $items], JSON_UNESCAPED_SLASHES);
