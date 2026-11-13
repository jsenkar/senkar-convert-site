// Exporters: CSV (several presets), XLSX, OFX / QBO / QFX. Pure JS, no network.

const pad = (n) => String(n).padStart(2, "0");
const us = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`; // MM/DD/YYYY
const money = (v) => (v == null ? "" : v.toFixed(2));

function csvCell(v) {
  const s = v == null ? "" : String(v);
  // guard against spreadsheet formula injection from descriptions
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_PRESETS = {
  standard: {
    label: "CSV (Excel, Google Sheets)",
    header: (r) => ["Date", "Description", "Amount", ...(hasBal(r) ? ["Balance"] : []), ...(hasCat(r) ? ["Category"] : [])],
    row: (t, r) => [us(t.date), t.description, money(t.amount), ...(hasBal(r) ? [money(t.balance)] : []), ...(hasCat(r) ? [t.category || ""] : [])],
  },
  quickbooks: {
    label: "QuickBooks Online CSV",
    // QBO 3-column format: Date, Description, Amount (negative = money out)
    header: () => ["Date", "Description", "Amount"],
    row: (t) => [us(t.date), t.description, money(t.amount)],
  },
  quickbooks4: {
    label: "QuickBooks Online CSV (Credit/Debit columns)",
    header: () => ["Date", "Description", "Credit", "Debit"],
    row: (t) => [us(t.date), t.description, t.amount > 0 ? money(t.amount) : "", t.amount < 0 ? money(-t.amount) : ""],
  },
  xero: {
    label: "Xero CSV",
    // Xero precoded statement import columns
    header: () => ["*Date", "*Amount", "Payee", "Description", "Reference"],
    row: (t) => [us(t.date), money(t.amount), "", t.description, ""],
  },
};
const hasBal = (r) => r.transactions.some((t) => t.balance != null);
const hasCat = (r) => r.transactions.some((t) => t.category);

export function toCSV(result, preset = "standard") {
  const p = CSV_PRESETS[preset] || CSV_PRESETS.standard;
  const lines = [p.header(result).map(csvCell).join(",")];
  for (const t of result.transactions) lines.push(p.row(t, result).map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- OFX/QBO/QFX
function ofxDate(iso) { return iso.replace(/-/g, "") + "120000"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * @param {object} result parseStatement() result
 * @param {"ofx"|"qbo"|"qfx"} flavor
 * @param {{acctId?:string, bankId?:string}} opts
 */
export function toOFX(result, flavor = "ofx", opts = {}) {
  const card = result.kind === "card";
  const txns = result.transactions;
  const start = result.period?.start || txns[0]?.date;
  const end = result.period?.end || txns[txns.length - 1]?.date;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const acct = (opts.acctId || "000000000").replace(/[^0-9A-Za-z]/g, "");
  const seen = {};
  const rows = txns.map((t) => {
    const base = hash(`${t.date}|${t.amount}|${t.description}`);
    seen[base] = (seen[base] || 0) + 1;
    const fitid = `${t.date.replace(/-/g, "")}${base}${seen[base]}`;
    const type = t.amount < 0 ? (card ? "DEBIT" : /check/i.test(t.description) ? "CHECK" : "DEBIT") : "CREDIT";
    return `<STMTTRN>
<TRNTYPE>${type}
<DTPOSTED>${ofxDate(t.date)}
<TRNAMT>${t.amount.toFixed(2)}
<FITID>${fitid}
<NAME>${esc(t.description.slice(0, 32))}
<MEMO>${esc(t.description.slice(0, 255))}
</STMTTRN>`;
  }).join("\n");
  const intu = flavor === "qbo" || flavor === "qfx" ? `<INTU.BID>${opts.bankId || "3000"}\n` : "";
  let bal = result.closing;
  if (bal != null && card) bal = -bal; // card balance owed is negative for OFX
  const ledger = bal != null ? `<LEDGERBAL>\n<BALAMT>${bal.toFixed(2)}\n<DTASOF>${ofxDate(end)}\n</LEDGERBAL>\n` : "";
  const acctFrom = card
    ? `<CCACCTFROM>\n<ACCTID>${acct}\n</CCACCTFROM>`
    : `<BANKACCTFROM>\n<BANKID>${opts.routing || "000000000"}\n<ACCTID>${acct}\n<ACCTTYPE>CHECKING\n</BANKACCTFROM>`;
  const tag = card ? "CCSTMT" : "STMT";
  const msgs = card ? "CREDITCARDMSGSRSV1" : "BANKMSGSRSV1";
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${stamp}
<LANGUAGE>ENG
${intu ? `<FI>\n<ORG>${opts.org || "Senkar"}\n<FID>${opts.bankId || "3000"}\n</FI>\n${intu}` : ""}</SONRS>
</SIGNONMSGSRSV1>
<${msgs}>
<${tag}TRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<${tag}RS>
<CURDEF>USD
${acctFrom}
<BANKTRANLIST>
<DTSTART>${ofxDate(start)}
<DTEND>${ofxDate(end)}
${rows}
</BANKTRANLIST>
${ledger}</${tag}RS>
</${tag}TRNRS>
</${msgs}>
</OFX>
`.replace(/\n/g, "\r\n");
}

// ----------------------------------------------------------------------- XLSX
const enc = new TextEncoder();
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Minimal ZIP writer (stored, no compression). files: [{name, data:Uint8Array}] */
export function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); // 1980-01-01
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true);
    h.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
function colName(i) { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function excelSerial(iso) { return (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000; }

export function toXLSX(result) {
  const bal = hasBal(result), cat = hasCat(result);
  const header = ["Date", "Description", "Amount", ...(bal ? ["Balance"] : []), ...(cat ? ["Category"] : [])];
  const rows = [];
  const cell = (r, c, v, kind) => {
    const ref = colName(c) + r;
    if (v == null || v === "") return "";
    if (kind === "date") return `<c r="${ref}" s="1"><v>${excelSerial(v)}</v></c>`;
    if (kind === "money") return `<c r="${ref}" s="2"><v>${v}</v></c>`;
    if (kind === "head") return `<c r="${ref}" s="3" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  rows.push(`<row r="1">${header.map((h, i) => cell(1, i, h, "head")).join("")}</row>`);
  result.transactions.forEach((t, i) => {
    const r = i + 2;
    const cs = [cell(r, 0, t.date, "date"), cell(r, 1, t.description), cell(r, 2, t.amount, "money")];
    let c = 3;
    if (bal) cs.push(cell(r, c++, t.balance, "money"));
    if (cat) cs.push(cell(r, c++, t.category || ""));
    rows.push(`<row r="${r}">${cs.join("")}</row>`);
  });
  const last = colName(header.length - 1) + (result.transactions.length + 1);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/><col min="3" max="5" width="14" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Transactions!$A$1:$${last.replace(/(\d+)$/, "$$$1")}</definedName></definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/styles.xml", styles],
  ];
  return zip(files.map(([name, s]) => ({ name, data: enc.encode(s) })));
}
