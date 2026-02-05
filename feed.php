<?php
require_once 'includes/db.php';
require_once 'includes/functions.php';

if(!is_logged_in()) redirect('/login');

$posts = $pdo->query("SELECT posts.content, posts.created_at, lands.username FROM posts JOIN lands ON lands.id = posts.user_id ORDER BY posts.created_at DESC")->fetchAll();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/sowwwl_assets/css/main.css">
    <title>Flux O.</title>
    <style>
        .feed { max-width: 600px; margin: 2rem auto; padding: 1rem; }
        .post { background: rgba(255,255,255,0.05); padding: 1rem; margin-bottom: 1rem; border-radius: 8px; }
        .post strong { color: var(--color-gold, #ffd700); }
        textarea { width: 100%; min-height: 80px; margin-bottom: 0.5rem; background: rgba(0,0,0,0.5); color: white; border: 1px solid #333; padding: 0.5rem; }
        button { cursor: pointer; }
    </style>
</head>
<body class="AeiouuoieA">
<main class="feed">
    <h1>Flux</h1>
    <p><a href="/dashboard">← Retour au dashboard</a></p>
    
    <form method="post" action="post.php">
        <input type="hidden" name="csrf_token" value="<?=csrf_token()?>">
        <textarea name="content" required placeholder="Exprime-toi sur le réseau..."></textarea>
        <div>
            <button type="submit" class="btn btn-primary">Publier</button>
        </div>
    </form>
    
    <div class="posts-list">
    <?php foreach($posts as $p):?>
        <article class="post">
            <header>
                <strong><?=e($p['username'])?></strong>
                <small style="opacity:0.6; margin-left:10px;"><?=e($p['created_at'])?></small>
            </header>
            <div class="content">
                <?=nl2br(e($p['content']))?>
            </div>
        </article>
    <?php endforeach;?>
    </div>
</main>
</body>
</html>
