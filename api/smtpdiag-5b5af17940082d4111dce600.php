<?php
// TEMPORARY SMTP diagnostic (no mail sent, password never echoed). Deleted right after use.
header('Content-Type: application/json'); header('Cache-Control: no-store');
require __DIR__ . '/smtp.php'; require_once sf_mail_key_file();
$log = []; $host = defined('SMTP_HOST') ? SMTP_HOST : 'smtp.titan.email';
foreach ([["ssl://$host", 465], ["tcp://$host", 587]] as [$h, $p]) {
  $fp = @stream_socket_client("$h:$p", $en, $es, 10);
  if (!$fp) { $log[] = "$h:$p connect FAIL $en $es"; continue; }
  stream_set_timeout($fp, 10);
  $rd = function () use ($fp) { $d=''; while (($l=fgets($fp,1024))!==false) { $d.=$l; if (strlen($l)<4||$l[3]===' ') break; } return trim($d); };
  $log[] = "$h:$p " . $rd();
  if ($p == 465) {
    fwrite($fp, "EHLO statementflip.senkarconsulting.com\r\n"); $log[] = $rd();
    fwrite($fp, "AUTH LOGIN\r\n"); $log[] = $rd();
    fwrite($fp, base64_encode(SMTP_USER)."\r\n"); $log[] = $rd();
    fwrite($fp, base64_encode(SMTP_PASS)."\r\n"); $log[] = $rd();
    $log[] = 'passlen=' . strlen(SMTP_PASS) . ' user=' . SMTP_USER;
  }
  fwrite($fp, "QUIT\r\n"); fclose($fp);
}
echo json_encode($log);
