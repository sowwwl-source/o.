<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$dir = __DIR__ . '/data/botes';
if (!is_dir($dir)) { mkdir($dir, 0775, true); }

$id = (string)($_POST['id'] ?? '');
$title = trim((string)($_POST['title'] ?? 'B(o)Té'));
$content = (string)($_POST['content'] ?? '');

if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>'bad_id'], JSON_UNESCAPED_UNICODE);
  exit;
}

$file = $dir . "/$id.json";
if (!is_file($file)) {
  http_response_code(404);
  echo json_encode(['ok'=>false,'error'=>'not_found'], JSON_UNESCAPED_UNICODE);
  exit;
}

// basic size guard (avoid insane writes)
if (strlen($content) > 250000) {
  http_response_code(413);
  echo json_encode(['ok'=>false,'error'=>'too_large'], JSON_UNESCAPED_UNICODE);
  exit;
}

// load existing
$raw = file_get_contents($file);
$j = json_decode($raw ?: "{}", true);
if (!is_array($j)) $j = [];

$j['title'] = $title !== '' ? $title : 'B(o)Té';
$j['content'] = $content;
$j['updated_at'] = gmdate('c');

$ok = (bool)file_put_contents($file, json_encode($j, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT), LOCK_EX);
echo json_encode(['ok'=>$ok], JSON_UNESCAPED_UNICODE);
