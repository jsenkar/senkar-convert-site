<?php
// First-party visit beacon: appends "ISO-time<TAB>ref<TAB>path" to visits.log, which lives
// above the web root (read it with the hosting File Manager). No cookies, no IP, no user agent,
// nothing about statements. Only called when a page is opened with ?ref=.
header('Content-Type: application/json'); header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit('{"ok":false}'); }
$in = json_decode(file_get_contents('php://input', false, null, 0, 2048), true);
$ref = is_array($in) ? (string)($in['ref'] ?? '') : '';
$path = is_array($in) ? (string)($in['path'] ?? '') : '';
if (!preg_match('/^[A-Za-z0-9_-]{1,60}$/', $ref) || !preg_match('#^/[A-Za-z0-9/_.-]{0,120}$#', $path)) { http_response_code(400); exit('{"ok":false}'); }
$file = getenv('STATEMENTFLIP_VISIT_LOG') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../visits.log');
if (is_file($file) && filesize($file) > 5000000) { http_response_code(507); exit('{"ok":false}'); }
file_put_contents($file, gmdate('c') . "\t" . $ref . "\t" . $path . "\n", FILE_APPEND | LOCK_EX);
echo '{"ok":true}';
