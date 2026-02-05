<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Token secret (edit upload_config.php)
$UPLOAD_TOKEN = null;
$configPath = __DIR__ . '/upload_config.php';
if (is_file($configPath)) {
    require $configPath;
}
if (!is_string($UPLOAD_TOKEN) || $UPLOAD_TOKEN === '' || $UPLOAD_TOKEN === 'CHANGE_ME') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server not configured']);
    exit;
}

// Token check
$token = '';
if (isset($_SERVER['HTTP_X_UPLOAD_TOKEN'])) {
    $token = trim($_SERVER['HTTP_X_UPLOAD_TOKEN']);
}
if ($token === '' && isset($_POST['token'])) {
    $token = trim($_POST['token']);
}
if ($token === '' || !hash_equals($UPLOAD_TOKEN, $token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Invalid token']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing file']);
    exit;
}

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Upload error']);
    exit;
}

$maxBytes = 20 * 1024 * 1024; // 20 MB
if ($file['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'File too large']);
    exit;
}

$mime = null;
if (class_exists('finfo')) {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
} elseif (function_exists('mime_content_type')) {
    $mime = mime_content_type($file['tmp_name']);
}
if (!$mime && isset($file['type'])) {
    $mime = $file['type'];
}
$allowed = [
    'audio/mpeg' => 'mp3',
    'audio/mp3' => 'mp3',
    'audio/wav' => 'wav',
    'audio/x-wav' => 'wav',
    'audio/ogg' => 'ogg',
    'audio/webm' => 'webm',
    'audio/mp4' => 'm4a',
    'audio/aac' => 'aac',
    'audio/x-m4a' => 'm4a'
];

if (!isset($allowed[$mime])) {
    http_response_code(415);
    echo json_encode(['ok' => false, 'error' => 'Unsupported audio type']);
    exit;
}

$uploadsDir = __DIR__ . '/uploads';
if (!is_dir($uploadsDir) && !mkdir($uploadsDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Upload directory error']);
    exit;
}

$filename = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $allowed[$mime];
$targetPath = $uploadsDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to save file']);
    exit;
}

$entry = [
    'file' => 'uploads/' . $filename,
    'created' => gmdate('c'),
    'size' => (int) $file['size'],
    'type' => $mime
];

$archivePath = __DIR__ . '/archive.json';
$items = [];

$fh = fopen($archivePath, 'c+');
if ($fh) {
    flock($fh, LOCK_EX);
    $contents = stream_get_contents($fh);
    if ($contents) {
        $decoded = json_decode($contents, true);
        if (is_array($decoded)) $items = $decoded;
    }

    array_unshift($items, $entry);
    if (count($items) > 200) {
        $items = array_slice($items, 0, 200);
    }

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($items, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
}

http_response_code(200);
echo json_encode(['ok' => true, 'item' => $entry]);
