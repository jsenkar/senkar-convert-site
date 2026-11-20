<?php
// TEMPORARY SMTP diagnostic: sends one test email and shows the server replies (never the password). Deleted right after use.
header('Content-Type: application/json'); header('Cache-Control: no-store');
require __DIR__ . '/smtp.php';
$GLOBALS['sf_smtp_log'] = [];
$sent = sf_send_mail('jasenkar@gmail.com', 'StatementFlip test 3: email delivery', "Hi John,\n\nThird test from StatementFlip to check site emails reach your inbox.\n\nStatementFlip, a product of Senkar Consulting, LLC\nsupport@senkarconsulting.com\n");
echo json_encode(['sent' => $sent, 'log' => $GLOBALS['sf_smtp_log']]);
