<?php
// Verifies a Stripe Checkout payment so the browser app can unlock paid features.
// Receives ONLY a Stripe session id. Never receives statements or any file data.
// The secret lives OUTSIDE the web root: <site folder>/stripe-key.php (never in git):
//   <?php define('STRIPE_KEY', 'rk_live_...');   // restricted key: Checkout Sessions (read) + Subscriptions (read)
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($arr, $code = 200) { http_response_code($code); echo json_encode($arr); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'method'], 405);
$body = json_decode(file_get_contents('php://input'), true);
$sid = is_array($body) && isset($body['session_id']) ? (string)$body['session_id'] : '';
if (!preg_match('/^cs_(live|test)_[A-Za-z0-9]{10,200}$/', $sid)) out(['ok' => false, 'error' => 'bad_session'], 400);

$keyFile = getenv('STATEMENTFLIP_KEY_FILE') ?: (rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../stripe-key.php');
if (!is_file($keyFile)) out(['ok' => false, 'error' => 'not_configured'], 503);
require $keyFile;
if (!defined('STRIPE_KEY')) out(['ok' => false, 'error' => 'not_configured'], 503);
$base = defined('STRIPE_API_BASE') ? STRIPE_API_BASE : 'https://api.stripe.com';

function stripe_get($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_USERPWD => STRIPE_KEY . ':']);
    $raw = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$raw, $http];
}
[$raw, $http] = stripe_get("$base/v1/checkout/sessions/" . rawurlencode($sid) . '?expand[]=subscription');
if ($raw === false) out(['ok' => false, 'error' => 'upstream'], 502);
$s = json_decode($raw, true);
if ($http === 404 || !is_array($s) || !isset($s['id'])) out(['ok' => false, 'error' => 'not_found'], 404);
if ($http >= 400) out(['ok' => false, 'error' => 'upstream'], 502);

$amount = (int)($s['amount_total'] ?? 0);
$mode = $s['mode'] ?? '';
$paid = ($s['payment_status'] ?? '') === 'paid' || ($s['payment_status'] ?? '') === 'no_payment_required';
$plans = ['payment' => [900 => 'single', 29700 => 'lifetime'], 'subscription' => [1900 => 'unlimited', 9700 => 'firm']];
$plan = $plans[$mode][$amount] ?? null;
if ($plan === null) out(['ok' => false, 'error' => 'unknown_plan'], 422);

$active = $paid;
if ($mode === 'subscription') {
    $st = $s['subscription']['status'] ?? '';
    $active = $paid && in_array($st, ['active', 'trialing', 'past_due'], true);
}
// Refunds: a fully refunded one-time payment no longer unlocks. Needs PaymentIntents/Charges read on the key;
// if that lookup fails we keep the paid result rather than lock out a real customer.
if ($active && $mode === 'payment' && !empty($s['payment_intent'])) {
    [$pr, $ph] = stripe_get("$base/v1/payment_intents/" . rawurlencode((string)$s['payment_intent']) . '?expand[]=latest_charge');
    $pi = $ph === 200 ? json_decode($pr, true) : null;
    $ch2 = is_array($pi) ? ($pi['latest_charge'] ?? null) : null;
    if (is_array($ch2) && (($ch2['refunded'] ?? false) === true || ((int)($ch2['amount_refunded'] ?? 0) >= $amount && $amount > 0))) $active = false;
}
out(['ok' => true, 'plan' => $plan, 'active' => $active, 'test' => ($s['livemode'] ?? true) === false]);
