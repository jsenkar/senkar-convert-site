// Paywall hook. Soft, client-side entitlement backed by /api/verify.php, which asks Stripe whether a
// Checkout session was paid. Only the Stripe session id is ever sent. Statements never leave the browser.
const KEY = "sc_license_v2";
const DAY = 86400000;
const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

const live = (l) => !!l && l.active && !(l.expiresAt && Date.now() > l.expiresAt);
export function plan() { const l = get(); return live(l) ? l : null; }
export function clearLicense() { try { localStorage.removeItem(KEY); } catch {} }

export function fingerprint(result) {
  const t = result.transactions;
  return `${t.length}|${result.closing}|${t[0]?.date}|${t[0]?.amount}|${t[t.length - 1]?.amount}`;
}

async function verify(config, sessionId) {
  const res = await fetch(config.verifyApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}

/** Called from /thanks/ with the session id Stripe put in the URL. */
export async function activateSession(config, sessionId) {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId || "")) return { ok: false, error: "That link doesn't look right." };
  let j;
  try { j = await verify(config, sessionId); } catch { return { ok: false, error: "Couldn't reach the server. Check your connection and reload this page." }; }
  if (!j.ok) return { ok: false, error: j.error === "not_configured" ? "Payments are still being set up. Email support and we'll unlock you by hand." : "We couldn't find that payment. If you just paid, wait a minute and reload." };
  if (!j.active) return { ok: false, error: "That payment isn't active." };
  const old = get();
  set({ session: sessionId, plan: j.plan, active: true, test: !!j.test, checkedAt: Date.now(), usedFor: old && old.session === sessionId ? old.usedFor || [] : [] });
  return { ok: true, plan: j.plan };
}

/** Tester code: single-use, checked by /api/redeem.php; unlocks unlimited in this browser for 30 days. Only the code is sent. */
export async function redeemCode(code) {
  let r, j;
  try { r = await fetch("/api/redeem.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }); j = await r.json().catch(() => ({})); }
  catch { return { ok: false, error: "Couldn't reach the server. Check your connection and try again." }; }
  if (!j.ok) return { ok: false, error: j.error === "used" ? "That code has already been used." : "That code isn't valid. Check it and try again." };
  const cur = plan();
  if (cur && cur.plan !== "single" && cur.plan !== "tester") return { ok: true, plan: cur.plan, kept: true };
  set({ plan: "tester", active: true, code: true, checkedAt: Date.now(), expiresAt: Date.now() + (j.days || 30) * DAY, usedFor: [] });
  return { ok: true, plan: "tester" };
}

/** Re-check subscriptions about once a day so a cancelled plan stops unlocking. Network trouble never locks anyone out within 7 days. */
export async function revalidate(config) {
  const l = get();
  if (!l || !l.active || (l.plan !== "unlimited" && l.plan !== "firm")) return;
  if (Date.now() - l.checkedAt < DAY) return;
  try {
    const j = await verify(config, l.session);
    if (j.ok) { l.active = !!j.active; l.checkedAt = Date.now(); set(l); }
    else if (j.status === 404) { l.active = false; set(l); }
  } catch { if (Date.now() - l.checkedAt > 7 * DAY) { l.active = false; set(l); } }
}

/** Can this statement be fully exported? A $9 purchase covers exactly one statement. */
export function canExportFull(result) {
  const l = get();
  if (!live(l)) return false;
  if (l.plan !== "single") return true;
  const fp = fingerprint(result);
  l.usedFor = l.usedFor || [];
  if (l.usedFor.includes(fp)) return true;
  if (l.usedFor.length < 1) { l.usedFor.push(fp); set(l); return true; }
  return false;
}
