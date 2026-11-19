<?php
// Restore access on a new device. The visitor types the email they paid with; if Stripe has a paid
// purchase for it we EMAIL a one-time-style link (/thanks/?session_id=...) to that address only.
// The reply is always the same, so this cannot be used to find out who is a customer. No statements are involved.
header('Content-Type: application/json'); header('Cache-Control: no-store');
function out($a, $c = 200) { http_response_code($c); echo json_encode($a); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(['ok' => false], 405);
$in = json_decode(file_get_contents('php://input', false, null, 0, 2048), true);
$email = is_array($in) ? trim((string)($in['email'] ?? '')) : '';
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 200) out(['ok' => false, 'error' => 'bad_email'], 400);

$keyFile = getenv('STATEMENTFLIP_KEY_FILE') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../stripe-key.php');
if (!is_file($keyFile)) out(['ok' => false, 'error' => 'not_configured'], 503);
require $keyFile;
if (!defined('STRIPE_KEY')) out(['ok' => false, 'error' => 'not_configured'], 503);
$base = defined('STRIPE_API_BASE') ? STRIPE_API_BASE : 'https://api.stripe.com';

// crude global throttle: at most 30 lookups an hour
$tf = getenv('STATEMENTFLIP_THROTTLE_FILE') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../restore-throttle.txt');
$now = time(); $hits = [];
if (is_file($tf)) foreach (explode("\n", (string)file_get_contents($tf)) as $t) if ((int)$t > $now - 3600) $hits[] = (int)$t;
if (count($hits) >= 30) out(['ok' => false, 'error' => 'busy'], 429);
$hits[] = $now; file_put_contents($tf, implode("\n", $hits), LOCK_EX);

$plans = ['payment' => [900 => 'single', 29700 => 'lifetime'], 'subscription' => [1900 => 'unlimited', 9700 => 'firm']];
$rank = ['lifetime' => 4, 'firm' => 3, 'unlimited' => 2, 'single' => 1];
$best = null;
foreach (array_unique([$email, strtolower($email)]) as $e) {
    $ch = curl_init("$base/v1/checkout/sessions?limit=30&expand[]=data.subscription&customer_details[email]=" . rawurlencode($e));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_USERPWD => STRIPE_KEY . ':']);
    $raw = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($raw === false || $http >= 400) out(['ok' => false, 'error' => 'upstream'], 502);
    $j = json_decode($raw, true);
    foreach (($j['data'] ?? []) as $s) {
        if (($s['payment_status'] ?? '') !== 'paid') continue;
        $mode = $s['mode'] ?? ''; $plan = $plans[$mode][(int)($s['amount_total'] ?? 0)] ?? null;
        if ($plan === null) continue;
        if ($mode === 'subscription' && !in_array($s['subscription']['status'] ?? '', ['active', 'trialing', 'past_due'], true)) continue;
        if ($best === null || $rank[$plan] > $rank[$best['plan']]) $best = ['plan' => $plan, 'id' => $s['id']];
    }
}
if ($best !== null) {
    $origin = getenv('STATEMENTFLIP_ORIGIN') ?: 'https://statementflip.senkarconsulting.com';
    $link = "$origin/thanks/?session_id=" . $best['id'];
    $names = ['single' => 'single statement', 'unlimited' => 'Unlimited', 'firm' => 'Firm', 'lifetime' => 'Lifetime'];
    $body = "Hi,\n\nHere is your StatementFlip access link for your {$names[$best['plan']]} plan. Open it in the browser you want to use:\n\n$link\n\n"
          . "Your statements are never uploaded. If you didn't ask for this, you can ignore this email.\n\nStatementFlip, a product of Senkar Consulting, LLC\nsupport@senkarconsulting.com\n";
    $sink = getenv('STATEMENTFLIP_MAIL_SINK');
    if ($sink) file_put_contents($sink, "TO: $email\n$body\n---\n", FILE_APPEND);
    else @mail($email, 'Your StatementFlip access link', $body, "From: StatementFlip <support@senkarconsulting.com>\r\nReply-To: support@senkarconsulting.com\r\nContent-Type: text/plain; charset=utf-8");
}
out(['ok' => true]);
