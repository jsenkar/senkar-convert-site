// Paywall hook. Soft, client-side check against Lemon Squeezy's public license API.
// Only the license key is sent. Statement data is never sent anywhere.
const KEY = "sc_license_v1";
const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

export function plan() { return get(); }
export function clearLicense() { try { localStorage.removeItem(KEY); } catch {} }

export function fingerprint(result) {
  const t = result.transactions;
  return `${t.length}|${result.closing}|${t[0]?.date}|${t[0]?.amount}|${t[t.length - 1]?.amount}`;
}

/** Returns {ok, plan:'single'|'unlimited'|'firm', error?} */
export async function activate(config, key) {
  key = (key || "").trim();
  if (!key) return { ok: false, error: "Enter your license key." };
  let res;
  try {
    res = await fetch(config.licenseApi, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key }),
    });
  } catch { return { ok: false, error: "Couldn't reach the license server. Check your connection and try again." }; }
  const j = await res.json().catch(() => ({}));
  if (!j.valid) return { ok: false, error: j.error || "That key isn't valid." };
  if (j.license_key && j.license_key.status && j.license_key.status !== "active" && j.license_key.status !== "inactive")
    return { ok: false, error: "That license is " + j.license_key.status + "." };
  const name = ((j.meta && (j.meta.variant_name + " " + j.meta.product_name)) || "").toLowerCase();
  const p = /firm/.test(name) ? "firm" : /unlimited|month/.test(name) ? "unlimited" : "single";
  const lic = { key, plan: p, usedFor: [], test: !!(j.meta && j.meta.test_mode) };
  const old = get();
  if (old && old.key === key) lic.usedFor = old.usedFor || [];
  set(lic);
  return { ok: true, plan: p };
}

/** Can this statement be fully exported? Single keys cover exactly one statement. */
export function canExportFull(result) {
  const l = get();
  if (!l) return false;
  if (l.plan !== "single") return true;
  const fp = fingerprint(result);
  if (l.usedFor.includes(fp)) return true;
  if (l.usedFor.length < 1) { l.usedFor.push(fp); set(l); return true; }
  return false;
}
