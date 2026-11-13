import * as pdfjsLib from "../vendor/pdf.min.mjs";
import { extractPages } from "./core/pdftext.js";
import { parseStatement } from "./core/parser.js";
import { toCSV, toXLSX, toOFX } from "./core/export.js";
import { activate, canExportFull, plan, clearLicense } from "./core/license.js";
import { CONFIG } from "./config.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
const $ = (id) => document.getElementById(id);
let current = null; // parsed result (stays in memory only)
let currentName = "statement";

const fmtMoney = (v) => (v == null ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

function status(msg, err) { const s = $("status"); s.hidden = !msg; s.textContent = msg || ""; s.className = "status" + (err ? " err" : ""); }

function soon(a, label) { a.removeAttribute("href"); a.textContent = label + " (coming soon)"; a.style.opacity = ".6"; a.style.pointerEvents = "none"; }
document.querySelectorAll("[data-checkout]").forEach((a) => { if (CONFIG.live) { a.href = CONFIG.checkout[a.dataset.checkout]; a.target = "_blank"; a.rel = "noopener"; } else soon(a, a.textContent); });
if (!CONFIG.live) { const h = $("enter-key"); if (h) h.parentElement.hidden = true; }

const drop = $("drop"), input = $("file");
drop.addEventListener("click", () => input.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handle(f); });
input.addEventListener("change", () => { if (input.files[0]) handle(input.files[0]); input.value = ""; });

async function handle(file) {
  $("result").hidden = true;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return status("Please choose a PDF file.", true);
  status("Reading your statement on this device…");
  currentName = file.name.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 40) || "statement";
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    let pages;
    try { pages = await extractPages(pdfjsLib, data.slice(), { standardFontDataUrl: new URL("../vendor/standard_fonts/", import.meta.url).href }); }
    catch (e) {
      if (e && e.name === "PasswordException") {
        const pw = window.prompt("This PDF is password protected. Enter the password (it stays on your computer):");
        if (!pw) return status("Password needed to read this PDF.", true);
        pages = await extractPages(pdfjsLib, data.slice(), { password: pw, standardFontDataUrl: new URL("../vendor/standard_fonts/", import.meta.url).href });
      } else throw e;
    }
    const chars = pages.reduce((s, p) => s + p.lines.reduce((t, l) => t + l.text.length, 0), 0);
    if (chars < 50) return status("This looks like a scanned or image-only PDF. Right now we only read digital PDFs downloaded from online banking.", true);
    const res = parseStatement(pages);
    if (!res.transactions.length) return status(`We couldn't find transactions in this PDF. Email ${CONFIG.supportEmail} and we'll add support for your bank, usually within a day. Your file was never uploaded, so you can describe the bank instead.`, true);
    current = res;
    render();
    status("");
  } catch (e) {
    console.error(e);
    status(`Something went wrong reading that file. Try a fresh download from your bank, or email ${CONFIG.supportEmail}.`, true);
  }
}

function render() {
  const r = current, full = unlocked();
  const rows = full ? r.transactions : r.transactions.slice(0, CONFIG.freeRows);
  const tb = $("tbl").querySelector("tbody");
  tb.textContent = "";
  const hasBal = r.transactions.some((t) => t.balance != null);
  document.querySelector("th.bal").hidden = !hasBal;
  for (const t of rows) {
    const tr = document.createElement("tr");
    const cells = [[fmtDate(t.date), ""], [t.description, ""], [fmtMoney(t.amount), "r " + (t.amount < 0 ? "neg" : "pos")]];
    if (hasBal) cells.push([fmtMoney(t.balance), "r"]);
    for (const [txt, cls] of cells) { const td = document.createElement("td"); td.textContent = txt; if (cls) td.className = cls; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  const s = $("summary"); s.textContent = "";
  const chip = (txt, cls = "") => { const c = document.createElement("span"); c.className = "chip " + cls; c.textContent = txt; s.appendChild(c); };
  chip(`${r.totals.count} transactions`);
  chip(`${r.kind === "card" ? "Charges" : "Out"}: ${fmtMoney(Math.abs(r.totals.out))}`);
  chip(`${r.kind === "card" ? "Payments & credits" : "In"}: ${fmtMoney(r.totals.in)}`);
  if (r.reconcile) r.reconcile.ok ? chip("✓ Totals match the statement's opening and closing balance", "ok") : chip(`Check totals: off by ${fmtMoney(Math.abs(r.reconcile.diff))}. Review the rows before using`, "warn");
  else chip("Couldn't find opening/closing balance to double-check totals", "warn");
  if (r.period.guessed) chip("Statement year was guessed. Check the dates", "warn");
  if (r.unsure) chip(`${r.unsure} rows had unclear +/− signs`, "warn");

  const hidden = r.transactions.length - rows.length;
  const lk = $("locked");
  lk.hidden = full || hidden <= 0;
  if (!lk.hidden) {
    lk.textContent = "";
    const p = document.createElement("div");
    p.innerHTML = `<b>Free preview: first ${rows.length} of ${r.transactions.length} transactions.</b> Unlock the full statement to see and download everything.`;
    lk.appendChild(p);
    for (const [k, label] of [["single", "Unlock this statement: $9"], ["monthly", "Unlimited: $19/mo"]]) {
      const a = document.createElement("a"); a.className = "btn" + (k === "monthly" ? "" : " ghost"); a.textContent = label; if (CONFIG.live) { a.href = CONFIG.checkout[k]; a.target = "_blank"; a.rel = "noopener"; } else soon(a, label); lk.appendChild(a);
    }
    if (CONFIG.live) { const b = document.createElement("a"); b.href = "#"; b.textContent = "I have a license key"; b.onclick = (e) => { e.preventDefault(); openKey(); }; lk.appendChild(b); }
  }
  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function unlocked() { return !!current && canExportFull(current); }

$("dl").addEventListener("click", () => {
  if (!current) return;
  const full = unlocked();
  const r = full ? current : { ...current, transactions: current.transactions.slice(0, CONFIG.freeRows) };
  const f = $("fmt").value;
  let blob, ext;
  if (f === "xlsx") { blob = new Blob([toXLSX(r)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); ext = "xlsx"; }
  else if (f === "qbo" || f === "ofx") { blob = new Blob([toOFX(r, f)], { type: "application/x-ofx" }); ext = f; }
  else { blob = new Blob(["﻿" + toCSV(r, f === "csv" ? "standard" : f)], { type: "text/csv" }); ext = "csv"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentName}${full ? "" : "_preview"}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (!full) status("Downloaded the free preview only. Unlock the rest above.");
});
$("again").addEventListener("click", () => { current = null; $("result").hidden = true; status(""); window.scrollTo({ top: 0, behavior: "smooth" }); });

// ---- license key dialog
const dlg = $("keydlg");
function openKey() { $("keyerr").textContent = ""; dlg.showModal(); }
$("enter-key").addEventListener("click", (e) => { e.preventDefault(); openKey(); });
$("keyok").addEventListener("click", async (e) => {
  e.preventDefault();
  const btn = e.target; btn.disabled = true; btn.textContent = "Checking…";
  const res = await activate(CONFIG, $("keyin").value);
  btn.disabled = false; btn.textContent = "Activate";
  if (!res.ok) { $("keyerr").textContent = res.error; return; }
  dlg.close(); badge(); if (current) render();
});
function badge() {
  const p = plan();
  $("plan-badge").textContent = p ? ` ✓ ${p.plan === "single" ? "One-statement" : p.plan === "firm" ? "Firm" : "Unlimited"} license active` : "";
}
badge();
