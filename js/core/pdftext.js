// Turns a PDF into positioned text lines using pdf.js. Runs in the browser
// (and in Node for tests). Nothing is sent anywhere.

/**
 * @param {object} pdfjsLib  the pdf.js module
 * @param {Uint8Array} data  PDF bytes
 * @param {{password?: string}} opts
 * @returns {Promise<Array<{page:number,width:number,height:number,lines:Line[]}>>}
 */
export async function extractPages(pdfjsLib, data, opts = {}) {
  const task = pdfjsLib.getDocument({
    data,
    password: opts.password,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: opts.standardFontDataUrl,
  });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, , d, x, y] = it.transform;
      const size = Math.hypot(a, b) || Math.abs(d) || 8;
      items.push({ str: it.str, x, y, x2: x + (it.width || it.str.length * size * 0.5), size });
    }
    pages.push({ page: p, width: vp.width, height: vp.height, lines: groupLines(items) });
  }
  await doc.destroy();
  return pages;
}

/** Group text items into lines (same baseline) and merge nearby items into cells. */
export function groupLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const tol = Math.max(1.5, it.size * 0.35);
    let line = null;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
      if (Math.abs(lines[i].y - it.y) <= tol) { line = lines[i]; break; }
    }
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of line.items) {
      const prev = cells[cells.length - 1];
      const gap = prev ? it.x - prev.x2 : Infinity;
      // a normal word space is ~0.25em; columns are separated by much more
      if (prev && gap < Math.max(2, it.size * 0.6)) {
        prev.str += (gap > it.size * 0.12 && !prev.str.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
        prev.x2 = Math.max(prev.x2, it.x2);
      } else {
        cells.push({ str: it.str, x: it.x, x2: it.x2, size: it.size });
      }
    }
    for (const c of cells) c.str = c.str.replace(/\s+/g, " ").trim();
    line.cells = cells.filter((c) => c.str);
    line.text = line.cells.map((c) => c.str).join(" ");
    line.size = Math.max(...line.items.map((i) => i.size));
    delete line.items;
  }
  return lines.filter((l) => l.cells.length);
}
