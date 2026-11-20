// Visual effects only: aurora, floating cards, cursor glow, scroll reveals, looping demo, proof tabs,
// pricing tilt + count-up, drop-anywhere. No network requests, never reads statement data.
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var de = document.documentElement, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var top = $(".top"), hero = $(".hero");
  function onScroll() {
    var y = window.scrollY;
    if (top) top.classList.toggle("scrolled", y > 8);
    if (hero && !reduce) { hero.style.setProperty("--sy", Math.min(y, 900) + "px"); hero.style.setProperty("--hp", Math.min(Math.max(y / (innerHeight * 0.9), 0), 1).toFixed(3)); }
  }
  onScroll(); addEventListener("scroll", onScroll, { passive: true });

  // ---- hero decoration (aria-hidden, purely visual) ----
  if (hero && !reduce) {
    var au = document.createElement("div"); au.className = "aurora"; au.setAttribute("aria-hidden", "true"); au.innerHTML = "<i></i><i></i><i></i>";
    var fl = document.createElement("div"); fl.className = "floaters"; fl.setAttribute("aria-hidden", "true");
    var spots = [[4, 14, -8, 3, 17], [80, 10, 6, -4, 21], [8, 62, 4, -6, 19], [84, 58, -5, 5, 23], [46, 86, -3, 3, 25]];
    spots.forEach(function (s, i) {
      var c = document.createElement("div"); c.className = "fl" + (i % 2 ? " g" : "");
      c.style.cssText = "left:" + s[0] + "%;top:" + s[1] + "%;--r0:" + s[2] + "deg;--r1:" + s[3] + "deg;--t:" + s[4] + "s;--dl:-" + i * 3 + "s;--dx:" + (i % 2 ? -24 : 26) + "px;--dy:" + (i % 3 ? -34 : 28) + "px";
      c.innerHTML = "<b></b><i></i><i></i><i></i><i></i>"; fl.appendChild(c);
    });
    hero.prepend(fl); hero.prepend(au);
    hero.addEventListener("pointermove", function (e) { var r = hero.getBoundingClientRect(); hero.style.setProperty("--mx", (e.clientX - r.left + (innerWidth - r.width) / 2) + "px"); hero.style.setProperty("--my", (e.clientY - r.top) + "px"); }, { passive: true });
  }

  // ---- drop zone states + drop anywhere on the page ----
  var drop = $("#drop"), input = $("#file"), status = $("#status"), result = $("#result");
  if (drop && input) {
    var depth = 0;
    document.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") > -1) { depth++; document.body.classList.add("dragging"); } });
    document.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove("dragging"); });
    document.addEventListener("dragover", function (e) { if (document.body.classList.contains("dragging")) e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      depth = 0; document.body.classList.remove("dragging");
      if (drop.contains(e.target) || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      try { input.files = e.dataTransfer.files; input.dispatchEvent(new Event("change")); } catch (err) {}
    });
    if (status && "MutationObserver" in window) {
      var mo = new MutationObserver(function () {
        var busy = !status.hidden && !status.classList.contains("err") && /Reading/.test(status.textContent);
        drop.classList.toggle("busy", busy);
        if (result && !result.hidden && !busy) { drop.classList.add("done"); setTimeout(function () { drop.classList.remove("done"); }, 1400); }
      });
      mo.observe(status, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    var tb = $("#tbl tbody");
    if (tb && "MutationObserver" in window) new MutationObserver(function () { $$("tr", tb).forEach(function (tr, i) { tr.style.setProperty("--i", Math.min(i, 30)); }); }).observe(tb, { childList: true });
  }

  // ---- looping demo ("See what you get") ----
  var story = $(".story");
  if (story) {
    var steps = $$(".story-steps li", story), pre = $(".pdfpeek", story);
    $$(".sheet tbody tr", story).forEach(function (tr, i) { tr.style.setProperty("--r", 250 + i * 120 + "ms"); });
    if (pre) pre.innerHTML = pre.textContent.split("\n").map(function (l) { return "<span>" + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>"; }).join("");
    var DUR = [3000, 3200, 3000, 3600], cur = 3, timer = null, playing = !reduce, visible = false, hover = false;
    function show(n) {
      cur = n; story.setAttribute("data-step", n);
      steps.forEach(function (li, i) { li.classList.toggle("on", i === n); li.setAttribute("aria-current", i === n ? "step" : "false"); li.style.setProperty("--dur", DUR[i] + "ms"); var c = li.cloneNode(true); });
      // restart the progress bar animation on the active step
      var on = steps[n]; if (on) { on.classList.remove("on"); void on.offsetWidth; on.classList.add("on"); }
    }
    function tick() { clearTimeout(timer); if (!(playing && visible && !hover)) return; timer = setTimeout(function () { show((cur + 1) % 4); tick(); }, DUR[cur]); }
    function sync() { story.classList.toggle("paused", !(playing && visible && !hover)); tick(); }
    steps.forEach(function (li, i) {
      li.tabIndex = 0; li.setAttribute("role", "button");
      li.addEventListener("click", function () { show(i); sync(); });
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(i); sync(); } });
    });
    var copy = $(".story-copy", story), ctl = document.createElement("div"); ctl.className = "story-ctl";
    var pb = document.createElement("button"); pb.type = "button";
    function label() { pb.textContent = playing ? "❚❚  Pause" : "▶  Play"; pb.setAttribute("aria-pressed", String(!playing)); pb.setAttribute("aria-label", playing ? "Pause the demo" : "Play the demo"); }
    pb.addEventListener("click", function () { playing = !playing; if (playing && cur === 3) show(0); label(); sync(); });
    label(); ctl.appendChild(pb); if (copy) copy.appendChild(ctl);
    var stage = $(".stage", story);
    if (stage) { stage.addEventListener("mouseenter", function () { hover = true; sync(); }); stage.addEventListener("mouseleave", function () { hover = false; sync(); }); }
    if (reduce || !("IntersectionObserver" in window)) { show(3); story.classList.add("paused"); }
    else {
      show(0);
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }, { threshold: 0.3 }).observe(story);
    }
  }

  // ---- proof tabs ----
  var tabs = $$(".proof [role=tab]");
  if (tabs.length) {
    var bar = $(".proof .tabs"), ind = document.createElement("span"); ind.className = "tab-ind"; ind.setAttribute("aria-hidden", "true"); bar.appendChild(ind);
    var ti = 0, auto = !reduce, tt = null, inView = false;
    function place() { var t = tabs[ti]; ind.style.width = t.offsetWidth + "px"; ind.style.transform = "translate(" + t.offsetLeft + "px," + (t.offsetTop - 5) + "px)"; ind.style.height = t.offsetHeight + "px"; ind.style.bottom = "auto"; ind.style.top = "5px"; }
    function sel(i, focus) {
      ti = i;
      tabs.forEach(function (t, j) { var on = j === i; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; var p = document.getElementById(t.getAttribute("aria-controls")); if (p) p.hidden = !on; });
      if (focus) tabs[i].focus(); place();
    }
    function rot() { clearTimeout(tt); if (auto && inView) tt = setTimeout(function () { sel((ti + 1) % tabs.length); rot(); }, 6500); }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { auto = false; sel(i); });
      t.addEventListener("keydown", function (e) { var k = e.key, n = k === "ArrowRight" ? (i + 1) % tabs.length : k === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : k === "Home" ? 0 : k === "End" ? tabs.length - 1 : -1; if (n > -1) { e.preventDefault(); auto = false; sel(n, true); } });
    });
    sel(0); addEventListener("resize", place);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; rot(); }, { threshold: 0.4 }).observe($(".proof"));
  }

  if (reduce || !("IntersectionObserver" in window)) { de.classList.add("fx-static"); return; }
  de.classList.add("fx");

  // ---- scroll reveals ----
  var sel2 = "main h2, .sub, .how li, .device, .story-copy, .stage, .story .balcheck, .proof .tabs, .panels, .firstrev, .plan, .have, .tool, .about p, .faq details, .cta p, .cta .btn, .prose > *";
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(sel2).forEach(function (el, i) { if (el.closest(".hero")) return; el.classList.add("rvl"); el.style.setProperty("--d", (i % 4) * 80 + "ms"); io.observe(el); });

  // ---- pricing: count-up on reveal, tilt + light follow on pointer ----
  var nums = $$(".plan .num");
  if (nums.length) {
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; cio.unobserve(e.target);
        var el = e.target, to = +el.textContent, t0 = null; if (!to) return;
        (function step(ts) { t0 = t0 || ts; var p = Math.min((ts - t0) / 1100, 1), v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v; if (p < 1) requestAnimationFrame(step); else el.textContent = to; })(performance.now());
        requestAnimationFrame(function s(ts) { });
      });
    }, { threshold: 0.6 });
    nums.forEach(function (n) { n.dataset.v = n.textContent; cio.observe(n); });
  }
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".plan").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.classList.add("tilting");
        card.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg"); card.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
        card.style.setProperty("--px", (x * 100).toFixed(1) + "%"); card.style.setProperty("--py", (y * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () { card.classList.remove("tilting"); card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    });
  }
})();
