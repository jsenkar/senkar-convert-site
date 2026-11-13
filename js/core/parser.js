// Generic bank / credit-card statement parser.
// Input: pages of positioned text lines (see pdftext.js). Output: transactions.
// Convention: amount < 0 = money out of your pocket (withdrawal, card purchase),
//             amount > 0 = money in (deposit, card payment/refund).

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";

const DATE_RES = [
  // 11/03, 11/03/26, 11/03/2026, 1/5, 11-03-2026
  { re: /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?(?![\d\/])/, f: (m) => ({ mo: +m[1], d: +m[2], y: m[3] }) },
  // Nov 3, Nov 03 2026, November 3, 2026
  { re: new RegExp(`^${MON}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?!\\d)`, "i"), f: (m) => ({ mo: MONTHS[m[1].toLowerCase()], d: +m[2], y: m[3] }) },
  // 03 Nov, 03 Nov 2026
  { re: new RegExp(`^(\\d{1,2})\\s+${MON}(?:,?\\s+(\\d{4}))?(?!\\d)`, "i"), f: (m) => ({ mo: MONTHS[m[2].toLowerCase()], d: +m[1], y: m[3] }) },
];

const AMOUNT_RE = /^(?<pre>[-+]\s*)?(?<open>\()?\s*(?<pre2>-\s*)?\$?\s*(?<num>\d{1,3}(?:,\d{3})*|\d+)\.(?<cents>\d{2})\s*(?<close>\))?(?<post>-)?\s*(?<tag>CR|DR|CREDIT|DEBIT)?$/i;

const OPENING_RE = /^(beginning|opening|previous|starting)\s+balance\b/i;
const CLOSING_RE = /^(ending|closing|new)\s+balance\b/i;
const TOTAL_RE = /^(total|totals|subtotal|daily (ending )?balance|average|minimum payment|payment due|credit limit|available credit)\b/i;
const CREDIT_SECTION = /^(deposits?|credits?|additions|deposits? (and|&) (other )?(additions|credits)|other (credits|additions)|electronic deposits?|atm (and|&) debit card deposits?|payments?,? (and )?(other )?credits|payments? and credits|refunds?)\b/i;
const DEBIT_SECTION = /^(withdrawals?|debits?|subtractions|withdrawals? (and|&) (other )?(subtractions|debits)|checks?( paid)?|electronic withdrawals?|atm (and|&) debit card (withdrawals?|subtractions)|other (withdrawals?|debits|subtractions)|(service )?fees( charged)?|purchases?( and (other )?(charges|adjustments|debits))?|interest charged|cash advances?|balance transfers?|card purchases)\b/i;

export function parseDate(text) {
  for (const { re, f } of DATE_RES) {
    const m = text.match(re);
    if (m) {
      const r = f(m);
      if (r.mo >= 1 && r.mo <= 12 && r.d >= 1 && r.d <= 31) return { ...r, len: m[0].length };
    }
  }
  return null;
}

export function parseAmount(str) {
  const m = str.trim().match(AMOUNT_RE);
  if (!m) return null;
  const g = m.groups;
  if (!!g.open !== !!g.close) return null;
  const value = +(g.num.replace(/,/g, "") + "." + g.cents);
  let sign = null;
  if ((g.pre && g.pre.includes("-")) || g.pre2 || g.open || g.post) sign = -1;
  else if (g.pre && g.pre.includes("+")) sign = 1;
  if (g.tag) sign = /^c/i.test(g.tag) ? 1 : -1;
  return { value, sign };
}

/** Find statement period in the text (used to give years to MM/DD dates). */
export function findPeriod(allText) {
  const t = allText.replace(/\s+/g, " ");
  const full = new RegExp(`${MON}\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*(?:-|–|to|through|thru)\\s*${MON}\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i");
  let m = t.match(full);
  if (m) return { start: mk(m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], m[2]), end: mk(m[6], MONTHS[m[4].toLowerCase().slice(0, 3)], m[5]) };
  const short = new RegExp(`${MON}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\s*(?:-|–|to|through|thru)\\s*${MON}\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i");
  m = t.match(short);
  if (m) {
    const ey = +m[6], sm = MONTHS[m[1].toLowerCase().slice(0, 3)], em = MONTHS[m[4].toLowerCase().slice(0, 3)];
    const sy = m[3] ? +m[3] : sm > em ? ey - 1 : ey;
    return { start: mk(sy, sm, m[2]), end: mk(ey, em, m[5]) };
  }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:-|–|to|through|thru)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (m) return { start: mk(yr(m[3]), m[1], m[2]), end: mk(yr(m[6]), m[4], m[5]) };
  const years = [...t.matchAll(/\b(20\d{2})\b/g)].map((x) => +x[1]);
  if (years.length) {
    const y = Math.max(...years);
    return { start: mk(y, 1, 1), end: mk(y, 12, 31), guessed: true };
  }
  const y = new Date().getFullYear();
  return { start: mk(y, 1, 1), end: mk(y, 12, 31), guessed: true };
}

function yr(y) { y = +y; return y < 100 ? 2000 + y : y; }
function mk(y, m, d) { return new Date(Date.UTC(+y, +m - 1, +d)); }
function iso(dt) { return dt.toISOString().slice(0, 10); }

function resolveDate(p, period) {
  if (p.y) return mk(yr(p.y), p.mo, p.d);
  const ey = period.end.getUTCFullYear();
  let best = null;
  for (const y of [ey, ey - 1, ey + 1]) {
    const dt = mk(y, p.mo, p.d);
    const dist = dt < period.start ? period.start - dt : dt > period.end ? dt - period.end : 0;
    if (!best || dist < best.dist) best = { dt, dist };
  }
  return best.dt;
}

function detectKind(text) {
  const card = (text.match(/credit card|card services|new balance|minimum payment|credit limit|previous balance|payment due date|card ?member|purchases? apr/gi) || []).length;
  const bank = (text.match(/checking|savings|deposits|withdrawals|beginning balance|ending balance|ending daily balance/gi) || []).length;
  return card > bank ? "card" : "bank";
}

const HEADER_WORDS = [
  ["date", /^(trans(action)?\.?\s*)?date\b|^date of\b|^posting date|^post(ed)? date|^trans(action)?$/i],
  ["desc", /description|merchant|transaction detail|details|payee|^memo/i],
  ["balance", /balance/i],
  ["credit", /deposit|credit|addition/i],
  ["debit", /withdrawal|debit|subtraction|charges?$/i],
  ["amount", /amount/i],
  ["category", /^category/i],
  ["check", /^check|^chk|^ref/i],
];

function headerColumns(line) {
  const cols = [];
  let hasDate = false, hasDesc = false;
  for (const c of line.cells) {
    for (const [role, re] of HEADER_WORDS) {
      if (re.test(c.str) && c.str.length < 45) {
        if (role === "date") hasDate = true;
        if (role === "desc") hasDesc = true;
        cols.push({ role, x: c.x, x2: c.x2, cx: (c.x + c.x2) / 2 });
        break;
      }
    }
  }
  const money = cols.filter((c) => ["balance", "credit", "debit", "amount"].includes(c.role));
  if ((hasDate || hasDesc) && money.length && cols.length >= 2) return cols;
  return null;
}

function columnFor(cell, cols) {
  let best = null;
  for (const col of cols) {
    if (!["balance", "credit", "debit", "amount"].includes(col.role)) continue;
    const overlap = Math.min(cell.x2, col.x2) - Math.max(cell.x, col.x);
    const dist = Math.min(Math.abs(cell.x2 - col.x2), Math.abs((cell.x + cell.x2) / 2 - col.cx), Math.abs(cell.x - col.x));
    const score = overlap > 0 ? -overlap : dist;
    if (!best || score < best.score) best = { col, score };
  }
  return best && best.score < 60 ? best.col.role : null;
}

function lastMoney(line) {
  for (let i = line.cells.length - 1; i >= 0; i--) {
    const a = parseAmount(line.cells[i].str);
    if (a) return a.value * (a.sign || 1);
  }
  const m = line.text.match(/-?\$?\s?\d{1,3}(,\d{3})*\.\d{2}\s*$/);
  return m ? parseAmount(m[0]).value * (m[0].includes("-") ? -1 : 1) : null;
}

/** Split a trailing amount out of a text cell like "STARBUCKS 4.50" when columns got merged. */
function splitCells(cells) {
  const out = [];
  for (const c of cells) {
    const m = c.str.match(/^(.*\S)\s+([-+(]?\s*\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:\s?(?:CR|DR))?)$/i);
    if (m && !parseAmount(c.str) && parseAmount(m[2]) && /[a-z]/i.test(m[1])) {
      const ratio = m[1].length / c.str.length;
      const xs = c.x + (c.x2 - c.x) * ratio;
      out.push({ ...c, str: m[1], x2: xs });
      out.push({ ...c, str: m[2], x: xs + 1 });
    } else out.push(c);
  }
  return out;
}

/**
 * @param {Array<{page:number,lines:any[]}>} pages
 */
export function parseStatement(pages) {
  const allText = pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n");
  const period = findPeriod(allText);
  const kind = detectKind(allText);
  const txns = [];
  let opening = null, closing = null;
  let cols = null;
  let section = 0; // +1 credit section, -1 debit section
  let cur = null; // transaction being built (for wrapped descriptions)

  for (const page of pages) {
    cur = null;
    for (const line of page.lines) {
      const text = line.text;
      const hdr = headerColumns(line);
      if (hdr) { cols = hdr; cur = null; continue; }
      if (/^page \d+( of \d+)?$/i.test(text)) { cur = null; continue; }

      const cells = splitCells(line.cells);
      const first = cells[0].str;
      const pd = parseDate(first);

      // balances (can appear with or without a leading date)
      const afterDate = pd ? (first.slice(pd.len).trim() + " " + cells.slice(1).map((c) => c.str).join(" ")).trim() : text;
      if (OPENING_RE.test(afterDate)) { const v = lastMoney(line); if (v != null && opening == null) opening = v; cur = null; continue; }
      if (CLOSING_RE.test(afterDate)) { const v = lastMoney(line); if (v != null) closing = v; cur = null; continue; }
      if (TOTAL_RE.test(text)) { cur = null; continue; }

      if (!pd) {
        // section heading?
        const amounts = cells.filter((c) => parseAmount(c.str));
        if (!amounts.length && CREDIT_SECTION.test(text)) { section = 1; cur = null; continue; }
        if (!amounts.length && DEBIT_SECTION.test(text)) { section = -1; cur = null; continue; }
        // continuation of the previous description?
        if (cur && !amounts.length && cur.lastY - line.y < Math.max(14, line.size * 1.7) && Math.abs(cells[0].x - cur.descX) < 15 && text.length < 120) {
          cur.t.description += " " + text;
          cur.lastY = line.y;
          continue;
        }
        cur = null;
        continue;
      }

      // ---- a dated line: transaction candidate
      const rest = [];
      const firstRest = first.slice(pd.len).trim();
      if (firstRest) rest.push({ ...cells[0], str: firstRest, x: cells[0].x + (cells[0].x2 - cells[0].x) * (pd.len / first.length) });
      rest.push(...cells.slice(1));
      // second date column (post date) -> skip
      if (rest.length && parseDate(rest[0].str) && parseDate(rest[0].str).len === rest[0].str.length) rest.shift();
      else if (rest.length) {
        const pd2 = parseDate(rest[0].str);
        if (pd2 && /^\d/.test(rest[0].str) && rest[0].str.slice(pd2.len).startsWith(" ")) rest[0] = { ...rest[0], str: rest[0].str.slice(pd2.len).trim() };
      }

      const moneyCells = [], textCells = [];
      let category = "";
      for (const c of rest) {
        const a = parseAmount(c.str);
        if (a && textCells.length + moneyCells.length > 0) moneyCells.push({ c, a, role: cols ? columnFor(c, cols) : null });
        else if (cols && cols.some((k) => k.role === "category" && Math.min(c.x2, k.x2 + 40) - Math.max(c.x, k.x - 5) > 0) && c.x > (textCells[0]?.x ?? 0) + 30) category = c.str;
        else textCells.push(c);
      }
      if (!moneyCells.length || !textCells.length) { cur = null; continue; }

      let amt = null, bal = null;
      const roled = moneyCells.filter((m) => m.role);
      if (roled.length === moneyCells.length && cols) {
        for (const m of moneyCells) {
          if (m.role === "balance") bal = m.a.value * (m.a.sign || 1);
          else if (!amt) amt = m;
        }
        if (!amt && moneyCells.length >= 2) { amt = moneyCells[0]; bal = moneyCells[moneyCells.length - 1].a.value; }
      } else {
        amt = moneyCells[0];
        if (moneyCells.length >= 2) bal = moneyCells[moneyCells.length - 1].a.value * (moneyCells[moneyCells.length - 1].a.sign || 1);
      }
      if (!amt) { cur = null; continue; }

      let sign;
      if (kind === "card") {
        // statements print charges positive and credits negative
        if (amt.a.sign != null) sign = amt.a.sign === -1 ? 1 : -1;
        else if (amt.role === "credit") sign = 1;
        else if (amt.role === "debit") sign = -1;
        else if (section === 1) sign = 1;
        else sign = -1;
      } else {
        if (amt.a.sign != null) sign = amt.a.sign;
        else if (amt.role === "credit") sign = 1;
        else if (amt.role === "debit") sign = -1;
        else if (section) sign = section;
        else sign = 0; // unknown, resolve with balances
      }

      const description = textCells.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim();
      const t = { date: iso(resolveDate(pd, period)), description, amount: amt.a.value * (sign || 1), page: page.page };
      if (!sign) t._unsure = true;
      if (bal != null) t.balance = bal;
      if (category) t.category = category;
      txns.push(t);
      cur = { t, lastY: line.y, descX: textCells[0].x };
    }
  }

  fixSignsWithBalances(txns, opening);
  for (const t of txns) { t.amount = round(t.amount); t.description = t.description.replace(/\s+/g, " ").trim(); }

  const sum = round(txns.reduce((s, t) => s + t.amount, 0));
  let reconcile = null;
  if (opening != null && closing != null) {
    const expectedClose = kind === "card" ? round(opening - sum) : round(opening + sum);
    reconcile = { ok: Math.abs(expectedClose - closing) < 0.005, expected: closing, computed: expectedClose, diff: round(closing - expectedClose) };
  }
  return {
    kind,
    period: { start: iso(period.start), end: iso(period.end), guessed: !!period.guessed },
    opening, closing, reconcile,
    transactions: txns.map(({ _unsure, ...t }) => t),
    unsure: txns.filter((t) => t._unsure).length,
    totals: {
      count: txns.length,
      in: round(txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
      out: round(txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
    },
  };
}

function round(v) { return Math.round(v * 100) / 100; }

/** Use running balances to fix or fill in signs. */
function fixSignsWithBalances(txns, opening) {
  let prev = opening;
  let pending = []; // txns since last known balance
  for (const t of txns) {
    pending.push(t);
    if (t.balance == null) continue;
    if (prev != null) {
      const fixed = pending.filter((p) => p !== t);
      const base = prev + fixed.reduce((s, p) => s + p.amount, 0);
      const abs = Math.abs(t.amount);
      if (Math.abs(base + abs - t.balance) < 0.005) { if (t.amount < 0 || t._unsure) t.amount = abs; delete t._unsure; }
      else if (Math.abs(base - abs - t.balance) < 0.005) { t.amount = -abs; delete t._unsure; }
    }
    prev = t.balance;
    pending = [];
  }
  // anything still unknown: treat as money out (most common line type)
  for (const t of txns) if (t._unsure) t.amount = -Math.abs(t.amount);
}
