<?php
// Minimal SMTP sender (implicit TLS, AUTH LOGIN) so site emails are sent by the real mailbox (Titan) and
// pass SPF/DKIM instead of landing in spam. Credentials live OUTSIDE the web root in mail-key.php:
//   <?php define('SMTP_USER', 'john@senkarconsulting.com'); define('SMTP_PASS', '...');
// Optional: define('SMTP_HOST', 'smtp.titan.email'); define('SMTP_PORT', 465); define('SMTP_FROM', 'support@senkarconsulting.com');
function sf_mail_key_file() { return getenv('STATEMENTFLIP_MAIL_KEY_FILE') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../mail-key.php'); }

/** Returns true when sent by SMTP. Falls back to PHP mail() only if no mail-key.php exists. */
function sf_send_mail($to, $subject, $body) {
    $from = 'support@senkarconsulting.com';
    $kf = sf_mail_key_file();
    if (!is_file($kf)) { return @mail($to, $subject, $body, "From: StatementFlip <$from>\r\nReply-To: $from\r\nContent-Type: text/plain; charset=utf-8"); }
    require_once $kf;
    if (!defined('SMTP_USER') || !defined('SMTP_PASS')) return false;
    $host = defined('SMTP_HOST') ? SMTP_HOST : 'smtp.titan.email';
    $port = defined('SMTP_PORT') ? SMTP_PORT : 465;
    if (defined('SMTP_FROM')) $from = SMTP_FROM;
    $fp = @stream_socket_client(($port == 465 ? 'ssl://' : 'tcp://') . "$host:$port", $en, $es, 15);
    if (!$fp) { error_log("smtp connect failed: $es"); return false; }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp) { $d = ''; while (($l = fgets($fp, 1024)) !== false) { $d .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; } return $d; };
    $cmd = function ($c, $ok) use ($fp, $read) { if ($c !== null) fwrite($fp, $c . "\r\n"); $r = $read(); if ((int)substr($r, 0, 3) !== $ok) { error_log('smtp: ' . trim($r)); return false; } return true; };
    $msg = "From: StatementFlip <$from>\r\nTo: <$to>\r\nReply-To: $from\r\nSubject: $subject\r\nDate: " . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . "@senkarconsulting.com>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
         . preg_replace('/^\./m', '..', str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body)));
    $ok = $cmd(null, 220) && $cmd('EHLO statementflip.senkarconsulting.com', 250) && $cmd('AUTH LOGIN', 334) && $cmd(base64_encode(SMTP_USER), 334) && $cmd(base64_encode(SMTP_PASS), 235)
       && $cmd("MAIL FROM:<$from>", 250) && $cmd("RCPT TO:<$to>", 250) && $cmd('DATA', 354) && $cmd($msg . "\r\n.", 250);
    @fwrite($fp, "QUIT\r\n"); fclose($fp);
    return $ok;
}
