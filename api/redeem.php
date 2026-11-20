<?php
// Single-use tester codes: a valid unused code unlocks unlimited for 30 days in that browser.
// Receives ONLY the code. Codes are stored as SHA-256 hashes in tester-codes.php (never plaintext in git).
// Redeemed codes are recorded in tester-used.txt, above the web root (hash<TAB>ISO time), created automatically.
header('Content-Type: application/json'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
function out($a, $c = 200) { http_response_code($c); echo json_encode($a); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(['ok' => false, 'error' => 'method'], 405);
$in = json_decode(file_get_contents('php://input', false, null, 0, 1024), true);
$code = strtoupper(trim(is_array($in) ? (string)($in['code'] ?? '') : ''));
if (!preg_match('/^FLIPTEST-[A-Z0-9]{4}-?[A-Z0-9]{4}$/', $code)) { usleep(400000); out(['ok' => false, 'error' => 'bad_code'], 400); }
$raw = str_replace('-', '', substr($code, 9));
$code = 'FLIPTEST-' . substr($raw, 0, 4) . '-' . substr($raw, 4, 4); // normalise to FLIPTEST-XXXX-XXXX
$hashes = require __DIR__ . '/tester-codes.php';
$h = hash('sha256', $code);
if (!in_array($h, $hashes, true)) { usleep(400000); out(['ok' => false, 'error' => 'unknown'], 404); }
$used = getenv('STATEMENTFLIP_CODES_USED') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../tester-used.txt');
$fp = fopen($used, 'c+'); if (!$fp) out(['ok' => false, 'error' => 'storage'], 500);
flock($fp, LOCK_EX);
$seen = stream_get_contents($fp);
if (strpos($seen, $h . "\t") !== false) { flock($fp, LOCK_UN); fclose($fp); out(['ok' => false, 'error' => 'used'], 409); }
fseek($fp, 0, SEEK_END); fwrite($fp, $h . "\t" . gmdate('c') . "\n"); fflush($fp); flock($fp, LOCK_UN); fclose($fp);
out(['ok' => true, 'plan' => 'tester', 'days' => 30]);
