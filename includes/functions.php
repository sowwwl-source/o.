<?php
function redirect($url){ header("Location: $url"); exit; }
function is_logged_in(){ return isset($_SESSION['user_id']); }
function generate_virtual_email($u){ return strtolower($u).'@o.local'; }

function csrf_token(){ 
    if(empty($_SESSION['csrf_token'])) $_SESSION['csrf_token']=bin2hex(random_bytes(32)); 
    return $_SESSION['csrf_token']; 
}

function check_csrf(){ 
    return isset($_POST['csrf_token']) && isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $_POST['csrf_token']); 
}

function e($s){ return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
