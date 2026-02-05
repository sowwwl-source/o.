<?php
require_once 'includes/db.php';
require_once 'includes/functions.php';

if(!is_logged_in() || !check_csrf()) redirect('/login');

$c = trim($_POST['content'] ?? '');
if($c){
    try {
        $stmt = $pdo->prepare("INSERT INTO posts(user_id, content) VALUES(?,?)");
        $stmt->execute([$_SESSION['user_id'], $c]);
    } catch (Exception $e) {
        // Silent fail or log
    }
}
redirect('feed.php');
