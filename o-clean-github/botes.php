<?php
declare(strict_types=1);

$dir = __DIR__ . '/data/botes';
if (!is_dir($dir)) { mkdir($dir, 0775, true); }

$files = glob($dir . '/*.json') ?: [];
$botes = [];
foreach ($files as $f) {
  $raw = @file_get_contents($f);
  if (!$raw) continue;
  $j = json_decode($raw, true);
  if (!is_array($j)) continue;
  $id = basename($f, '.json');
  $title = $j['title'] ?? $id;
  $updated = $j['updated_at'] ?? '';
  $botes[] = ['id'=>$id,'title'=>$title,'updated'=>$updated];
}
usort($botes, fn($a,$b)=> strcmp($b['updated'], $a['updated']));

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>B(o)Té</title>
<link rel="stylesheet" href="/assets/css/o.css">
</head>
<body>
<main id="o">
  <h1 class="muted">// B(o)Té //</h1>
  <p class="muted"><a href="/index.php">↩</a></p>

  <form method="post" action="/botes.php" class="field">
    <input type="text" name="new_title" placeholder="nouvelle B(o)Té — titre">
    <button class="btn" type="submit">Créer</button>
  </form>

  <div style="margin-top:18px">
    <?php if (!count($botes)): ?>
      <p class="muted">Aucune B(o)Té. Crée la première.</p>
    <?php else: ?>
      <ul>
        <?php foreach($botes as $b): ?>
          <li>
            <a href="/bote.php?id=<?=h($b['id'])?>"><?=h($b['title'])?></a>
            <span class="muted"> — <?=h($b['updated'])?></span>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </div>

  <p class="muted" style="margin-top:22px">
    Marquer orange : sélection + bouton <b>Orange</b> (ou Alt+O). Sauver : Ctrl/⌘+S.
  </p>
</main>
</body>
</html>
<?php
// create new after HTML to keep simple output (POST->redirect)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $title = trim((string)($_POST['new_title'] ?? ''));
  if ($title === '') $title = 'B(o)Té';
  $id = bin2hex(random_bytes(6));
  $data = [
    'id' => $id,
    'title' => $title,
    'content' => "⟦O⟧

",
    'created_at' => gmdate('c'),
    'updated_at' => gmdate('c'),
  ];
  file_put_contents($dir . "/$id.json", json_encode($data, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT), LOCK_EX);
  header("Location: /bote.php?id=" . urlencode($id));
  exit;
}
