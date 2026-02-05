<?php
declare(strict_types=1);

$dir = __DIR__ . '/data/botes';
if (!is_dir($dir)) { mkdir($dir, 0775, true); }

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[a-f0-9]{12}$/', $id)) {
  http_response_code(400);
  echo "Bad id";
  exit;
}

$file = $dir . "/$id.json";
if (!is_file($file)) {
  // create minimal if missing
  $data = [
    'id'=>$id,
    'title'=>"B(o)Té",
    'content'=>"⟦O⟧

",
    'created_at'=>gmdate('c'),
    'updated_at'=>gmdate('c'),
  ];
  file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT), LOCK_EX);
}

$raw = file_get_contents($file);
$j = json_decode($raw ?: "{}", true);
$title = (string)($j['title'] ?? 'B(o)Té');
$content = (string)($j['content'] ?? '');

?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title><?=h($title)?></title>
<link rel="stylesheet" href="/assets/css/o.css">
</head>
<body>
<main class="editor-wrap">
  <div class="toolbar">
    <a class="btn" href="/botes.php">↩</a>
    <div class="field">
      <form id="metaForm" method="post" action="/bote_save.php" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="hidden" name="id" value="<?=h($id)?>">
        <input type="text" name="title" value="<?=h($title)?>" aria-label="Titre">
        <input type="hidden" name="content" value="">
        <button id="btnSave" class="btn" type="submit">Sauver</button>
        <button id="btnOrange" class="btn" type="button">Orange</button>
        <span id="status" class="muted"></span>
      </form>
    </div>
  </div>

  <textarea id="src" spellcheck="false" autocomplete="off" autocapitalize="off"><?=h($content)?></textarea>

  <div class="render">
    <div id="scanOverlay" class="scanOverlay" aria-hidden="true"></div>
    <pre id="view"></pre>
  </div>

  <div class="hint">
    Scan : bouge le doigt/la souris. Si un caractère orange passe dans le O, le vert bascule en négatif.
  </div>
</main>

<script src="/assets/js/bote-editor.js"></script>
</body>
</html>
