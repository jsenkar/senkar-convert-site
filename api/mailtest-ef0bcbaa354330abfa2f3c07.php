<?php
// TEMPORARY one-off SMTP test. Deleted right after use.
header('Content-Type: application/json'); header('Cache-Control: no-store');
require __DIR__ . '/smtp.php';
$kf = sf_mail_key_file(); require_once $kf;
$placeholder = !defined('SMTP_PASS') || stripos(SMTP_PASS, 'PASTE') !== false;
$sent = sf_send_mail('jasenkar@gmail.com', 'StatementFlip test: email delivery', "Hi John,\n\nThis is a test from StatementFlip to check that site emails now reach your inbox.\n\nStatementFlip, a product of Senkar Consulting, LLC\nsupport@senkarconsulting.com\n");
echo json_encode(['placeholder' => $placeholder, 'sent' => $sent]);
