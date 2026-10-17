/* Cotee Challenge - motion layer.
   Celebrations, rank popups, count-ups, ambient demo life.
   Additive: observes the DOM, never changes app logic. Safe to remove. */
(function () {
  "use strict";

  var COLORS = ["#1E7A78", "#D98F3C", "#5BA3BE", "#0D3B40", "#C9A227", "#ffffff"];

  function $(id) { return document.getElementById(id); }
  function num(t) {
    var m = String(t == null ? "" : t).replace(/[^0-9]/g, "");
    return m ? parseInt(m, 10) : 0;
  }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function debounce(fn, ms) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ---------------- confetti ---------------- */
  function confetti(opts) {
    opts = opts || {};
    try {
      var count = opts.count || 90;
      var canvas = document.createElement("canvas");
      canvas.className = "confetti-canvas";
      var w = (canvas.width = window.innerWidth);
      var h = (canvas.height = window.innerHeight);
      document.body.appendChild(canvas);
      var ctx = canvas.getContext("2d");
      var ox = opts.x != null ? opts.x : w / 2;
      var oy = opts.y != null ? opts.y : h * 0.35;
      var parts = [];
      for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 4 + Math.random() * 7;
        parts.push({
          x: ox, y: oy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
          s: 5 + Math.random() * 6,
          r: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          c: COLORS[(Math.random() * COLORS.length) | 0]
        });
      }
      var start = performance.now(), dur = opts.duration || 2400;
      (function frame(now) {
        var t = (now - start) / dur;
        if (t >= 1) { canvas.remove(); return; }
        ctx.clearRect(0, 0, w, h);
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.99;
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.translate(p.x, p.y); ctx.rotate(p.r);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62);
          ctx.restore();
        }
        requestAnimationFrame(frame);
      })(start);
    } catch (e) { /* never break the app */ }
  }

  function floatPts(text, rect) {
    try {
      var d = document.createElement("div");
      d.className = "float-pts";
      d.textContent = text;
      var x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      var y = rect ? rect.top - 6 : window.innerHeight / 2;
      d.style.left = x + "px";
      d.style.top = y + "px";
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 1500);
    } catch (e) {}
  }

  /* ---------------- log celebration ---------------- */
  function watchLog() {
    var el = $("log-msg");
    if (!el) return;
    new MutationObserver(function () {
      try {
        if (!el.classList.contains("ok")) return;
        var m = /\+([\d,]+) pts logged/.exec(el.textContent || "");
        if (!m || el._celebrated === el.textContent) return;
        el._celebrated = el.textContent;
        var btn = $("log-submit");
        var r = btn ? btn.getBoundingClientRect() : null;
        confetti({ x: r ? r.left + r.width / 2 : undefined, y: r ? r.top : undefined, count: 80 });
        floatPts("+" + m[1] + " pts", r);
      } catch (e) {}
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- header points count-up ---------------- */
  function countUp(el, from, to, dur, done) {
    var start = performance.now();
    (function fr(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString("en-US");
      if (t < 1) requestAnimationFrame(fr);
      else if (done) done();
    })(start);
  }
  function watchHeader() {
    var el = $("hdr-points");
    if (!el) return;
    var last = num(el.textContent);
    new MutationObserver(function () {
      try {
        if (el._counting) return;
        var to = num(el.textContent);
        if (to === last || to <= 0) { last = to; return; }
        var from = last;
        last = to;
        el._counting = true;
        countUp(el, from, to, 900, function () { el._counting = false; });
      } catch (e) {}
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- progress ring animation ---------------- */
  function animateRing() {
    try {
      var svg = document.querySelector("#hero .ring-wrap svg");
      if (!svg) return;
      var circles = svg.querySelectorAll("circle");
      if (circles.length < 2) return;
      var prog = circles[1];
      var target = prog.getAttribute("stroke-dashoffset");
      var full = prog.getAttribute("stroke-dasharray");
      if (target == null || full == null || prog._animated === target) return;
      prog._animated = target;
      prog.style.transition = "none";
      prog.setAttribute("stroke-dashoffset", full);
      void svg.getBoundingClientRect();
      prog.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)";
      prog.setAttribute("stroke-dashoffset", target);
    } catch (e) {}
  }

  /* ---------------- rank change popups ---------------- */
  function boardRows() {
    var list = $("board-list") || $("home-board");
    if (!list) return [];
    return Array.prototype.slice.call(list.querySelectorAll(".lb-row"));
  }
  function rowName(row) {
    var nm = row.querySelector(".nm");
    if (!nm || !nm.childNodes.length) return "Someone";
    return (nm.childNodes[0].textContent || "Someone").trim();
  }
  function rowAvatar(row) {
    var a = row.querySelector(".ava");
    return a ? a.innerHTML : "";
  }
  function rowPoints(row) {
    var p = row.querySelector(".pt");
    return p ? num(p.textContent) : 0;
  }
  function myRow() {
    var rows = boardRows();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains("me")) return { row: rows[i], rank: i + 1 };
    }
    return null;
  }
  function boardKey() {
    var sel = $("board-select");
    if (sel && sel.options && sel.selectedIndex >= 0) return "cotee_rank_" + sel.options[sel.selectedIndex].text;
    var h = document.querySelector("#hero h2");
    return "cotee_rank_" + (h ? h.textContent.trim() : "board");
  }
  var rpTimer = null;
  function showRankPopup(avatarHtml, html) {
    try {
      var el = $("rank-popup");
      if (!el) return;
      el.innerHTML = '<span class="rp-ava">' + avatarHtml + '</span><span class="rp-txt">' + html + "</span>";
      el.classList.add("show");
      clearTimeout(rpTimer);
      rpTimer = setTimeout(function () { el.classList.remove("show"); }, 5000);
    } catch (e) {}
  }
  function checkRank() {
    try {
      var me = myRow();
      if (!me) return;
      var key = boardKey();
      var last = 0;
      try { last = parseInt(localStorage.getItem(key) || "0", 10) || 0; } catch (e) {}
      try { localStorage.setItem(key, String(me.rank)); } catch (e) {}
      if (!last || last === me.rank) return; // first sighting or no change
      var rows = boardRows();
      if (me.rank > last) {
        var above = rows[me.rank - 2]; // rank is 1-based
        if (!above) return;
        showRankPopup(rowAvatar(above),
          "<b>" + escHtml(rowName(above)) + "</b> just passed you. You are now #" + me.rank + ". Log something to take it back.");
      } else {
        var below = rows[me.rank]; // the one I just passed sits right below me now
        if (!below) return;
        showRankPopup(rowAvatar(below),
          "You passed <b>" + escHtml(rowName(below)) + "</b>. Now #" + me.rank + ". Keep the streak going.");
      }
    } catch (e) {}
  }

  /* ---------------- challenge-complete celebration ---------------- */
  function checkComplete() {
    try {
      var hero = $("hero");
      if (!hero) return;
      var h2 = hero.querySelector("h2");
      var big = hero.querySelector(".big");
      if (!h2 || !big) return;
      var m = /([\d,]+)\s+of\s+([\d,]+)\s+pts/.exec(big.textContent || "");
      if (!m || num(m[1]) < num(m[2])) return;
      var key = "cotee_done_" + h2.textContent.trim();
      var seen = null;
      try { seen = localStorage.getItem(key); } catch (e) {}
      if (seen) return;
      try { localStorage.setItem(key, "1"); } catch (e) {}
      var el = $("celebrate");
      if (!el) return;
      el.querySelector(".cel-title").textContent = h2.textContent.trim();
      el.querySelector(".cel-pts").textContent = m[1] + " points";
      el.classList.add("show");
      confetti({ count: 160, duration: 3200 });
      setTimeout(function () { confetti({ count: 80, duration: 2200 }); }, 900);
    } catch (e) {}
  }

  /* ---------------- ambient demo life ----------------
     In demo mode, coworkers log a little between visits so the board
     feels alive and rank popups actually happen. Gentle and resettable. */
  async function ambientDemo() {
    try {
      if (localStorage.getItem("cotee_demo") !== "1") return;
      if (!window.DemoSupabase) return;
      var last = parseInt(localStorage.getItem("cotee_ambient_at") || "0", 10) || 0;
      if (Date.now() - last < 3600 * 1000) return;
      if (Math.random() > 0.45) return;
      var sb = window.DemoSupabase();
      var pr = await sb.from("profiles").select("id");
      var ids = (pr.data || []).map(function (p) { return p.id; })
        .filter(function (id) { return id !== "demo-user-1"; });
      if (!ids.length) return;
      var ac = await sb.from("activities").select("id, points_per, per_quantity").eq("active", true);
      var acts = ac.data || [];
      if (!acts.length) return;
      var who = ids[(Math.random() * ids.length) | 0];
      var a = acts[(Math.random() * acts.length) | 0];
      var mult = 1 + ((Math.random() * 3) | 0);
      await sb.from("entries").insert({
        user_id: who,
        activity_id: a.id,
        quantity: a.per_quantity * mult,
        points: Math.round(a.points_per * mult),
        proof_url: null,
        note: null
      });
      try { localStorage.setItem("cotee_ambient_at", String(Date.now())); } catch (e) {}
    } catch (e) { /* silent */ }
  }

  /* ---------------- init ---------------- */
  function init() {
    ambientDemo();
    watchLog();
    watchHeader();
    var onBoards = debounce(checkRank, 350);
    var onHero = debounce(function () { animateRing(); checkComplete(); }, 250);
    [["hero", onHero, false], ["board-list", onBoards, true], ["home-board", onBoards, true]].forEach(function (cfg) {
      var el = $(cfg[0]);
      if (el) new MutationObserver(cfg[2] ? function () { onBoards(); } : function () { onHero(); })
        .observe(el, { childList: true, subtree: !!cfg[2] });
    });
    var cc = $("celebrate-close");
    if (cc) cc.onclick = function () { $("celebrate").classList.remove("show"); };
    var cel = $("celebrate");
    if (cel) cel.addEventListener("click", function (e) {
      if (e.target === cel) cel.classList.remove("show");
    });
  }

  window.CoteeMotion = {
    confetti: confetti,
    checkRank: checkRank,
    /* Test hook: the coworker right below me gains enough to pass me,
       so the "just passed you" popup fires. Demo only. */
    bumpRival: async function () {
      try {
        if (localStorage.getItem("cotee_demo") !== "1" || !window.DemoSupabase) return "demo only";
        var me = myRow();
        if (!me) return "log something first so you have a rank";
        var rows = boardRows();
        var below = rows[me.rank]; // 0-indexed: directly below me
        if (!below) return "you are last; log points first";
        var sb = window.DemoSupabase();
        var pr = await sb.from("profiles").select("id, display_name");
        var target = (pr.data || []).filter(function (p) {
          return p.id !== "demo-user-1" && p.display_name === rowName(below);
        })[0];
        if (!target) return "could not match rival";
        var need = rowPoints(me.row) - rowPoints(below) + 50;
        var ac = await sb.from("activities").select("id").eq("active", true).limit(1);
        var actId = (ac.data && ac.data[0] && ac.data[0].id) || 1;
        await sb.from("entries").insert({
          user_id: target.id, activity_id: actId,
          quantity: 1, points: need, proof_url: null, note: null
        });
        return "ok: " + target.display_name + " gained " + need + " pts";
      } catch (e) { return "error: " + (e && e.message); }
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
