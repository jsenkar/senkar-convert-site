// Visual polish only: scroll reveal, sample "flip" demo, header shadow. No network, no data.
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var de = document.documentElement;
  var top = document.querySelector(".top");
  function onScroll() { if (top) top.classList.toggle("scrolled", window.scrollY > 8); }
  onScroll(); addEventListener("scroll", onScroll, { passive: true });
  if (reduce || !("IntersectionObserver" in window)) { de.classList.add("fx-static"); var s0 = document.querySelector(".sample"); if (s0) s0.classList.add("flipped"); return; }
  de.classList.add("fx");
  var sel = "main h2, .how li, .plan, .faq h3, .faq p, .about > *, .sample .note, .sample .cols > div, .balcheck, .reviews > *";
  var els = document.querySelectorAll(sel);
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  els.forEach(function (el, i) { el.classList.add("rvl"); el.style.setProperty("--d", (i % 4) * 70 + "ms"); io.observe(el); });
  // Sample section: PDF text flips into spreadsheet rows when it scrolls into view; button replays it.
  var sec = document.querySelector(".sample");
  if (sec) {
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "flipbtn"; btn.textContent = "Replay the flip";
    var note = sec.querySelector(".note"); if (note) note.after(btn);
    var play = function () { sec.classList.remove("flipped"); void sec.offsetWidth; setTimeout(function () { sec.classList.add("flipped"); }, 350); };
    btn.addEventListener("click", play);
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { setTimeout(function () { sec.classList.add("flipped"); }, 500); o.disconnect(); } }, { threshold: 0.35 }).observe(sec);
    sec.querySelectorAll("tbody tr").forEach(function (tr, i) { tr.style.setProperty("--r", i * 110 + "ms"); });
    sec.querySelectorAll(".pdfpeek").forEach(function (pre) { pre.innerHTML = pre.textContent.split("\n").map(function (l, i) { return '<span style="--r:' + i * 110 + 'ms">' + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>"; }).join("\n"); });
  }
  // Parallax glow in hero follows scroll
  var hero = document.querySelector(".hero");
  if (hero) addEventListener("scroll", function () { hero.style.setProperty("--sy", Math.min(window.scrollY, 600) + "px"); }, { passive: true });
})();
