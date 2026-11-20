// CustomerReviews: renders real reviews only (grid "Wall of Love" or carousel) + JSON-LD.
// Placeholders show only with ?previewReviews=1 and never produce JSON-LD or ratings.
const root = document.getElementById("reviews");
if (root) init();

async function init() {
  const preview = new URLSearchParams(location.search).has("previewReviews");
  let data;
  try { data = await (await fetch("/data/reviews.json", { cache: "no-cache" })).json(); } catch { return; }
  const all = Array.isArray(data.reviews) ? data.reviews : [];
  const valid = (r) => r && typeof r.text === "string" && r.text.trim() && r.headline && r.name && Number(r.rating) >= 1 && Number(r.rating) <= 5;
  const real = all.filter((r) => valid(r) && r.placeholder === false && r.permission === true && r.source);
  const list = real.length ? real : preview ? all.filter(valid) : [];
  if (!list.length) return; // nothing real: render nothing at all
  const isPreview = !real.length;
  const view = root.dataset.view === "carousel" ? "carousel" : "grid";
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  root.appendChild(el("h2", null, "What bookkeepers say after the first statement"));
  if (isPreview) root.appendChild(el("p", "rv-preview", "PREVIEW ONLY: these are placeholders and are hidden from visitors until you add real reviews."));
  const groups = [...new Set(list.map((r) => r.situation).filter(Boolean))];
  const cards = [];
  const wrap = el("div", "rv-" + view); wrap.setAttribute("role", "list");
  if (groups.length > 1) {
    const bar = el("div", "rv-filters"); bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Filter reviews by situation");
    for (const g of ["All", ...groups]) {
      const b = el("button", "rv-chip", g); b.type = "button"; b.setAttribute("aria-pressed", g === "All" ? "true" : "false");
      b.onclick = () => { bar.querySelectorAll(".rv-chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cards.forEach((c) => { c.hidden = !(g === "All" || c.dataset.situation === g); }); };
      bar.appendChild(b);
    }
    root.appendChild(bar);
  }
  list.forEach((r, i) => {
    const card = el("figure", "rv-card"); card.setAttribute("role", "listitem"); card.dataset.situation = r.situation || ""; card.style.animationDelay = i * 70 + "ms";
    card.appendChild(el("p", "rv-headline", "\u201c" + r.headline.replace(/^PLACEHOLDER:\s*/, "") + "\u201d"));
    if (r.metric) card.appendChild(el("span", "rv-metric", r.metric));
    const stars = el("div", "rv-stars", "\u2605".repeat(r.rating) + "\u2606".repeat(5 - r.rating)); stars.setAttribute("role", "img"); stars.setAttribute("aria-label", r.rating + " out of 5 stars");
    card.append(stars, el("blockquote", null, r.text));
    const initials = r.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    const av = el("span", "rv-av", initials); av.setAttribute("aria-hidden", "true");
    const who = el("div", "rv-who"); who.append(el("b", null, r.name), el("span", null, [r.role, r.location].filter(Boolean).join(" \u00b7 ")));
    const foot = el("figcaption", "rv-foot"); foot.append(av, who);
    if (r.verified === true) foot.appendChild(el("span", "rv-badge", "\u2713 Verified customer"));
    else if (r.source) foot.appendChild(el("span", "rv-badge rv-src", r.source));
    card.appendChild(foot); wrap.appendChild(card); cards.push(card);
  });
  if (view === "carousel") {
    const mk = (t, d) => { const b = el("button", "rv-nav", t); b.type = "button"; b.setAttribute("aria-label", d < 0 ? "Previous review" : "Next review"); b.onclick = () => wrap.scrollBy({ left: d * wrap.clientWidth * 0.9, behavior: "smooth" }); return b; };
    const nav = el("div", "rv-navs"); nav.append(mk("‹", -1), mk("›", 1)); root.appendChild(wrap); root.appendChild(nav);
  } else root.appendChild(wrap);
  root.hidden = false;

  if (!isPreview) {
    const avg = list.reduce((s, r) => s + Number(r.rating), 0) / list.length;
    const ld = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: (data.business && data.business.name) || "StatementFlip", url: data.business && data.business.url, applicationCategory: "BusinessApplication", operatingSystem: "Web",
      aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: list.length, bestRating: 5, worstRating: 1 },
      review: list.map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.name }, datePublished: r.date, reviewBody: r.text, reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 } })) };
    const s = document.createElement("script"); s.type = "application/ld+json"; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
  }
}
