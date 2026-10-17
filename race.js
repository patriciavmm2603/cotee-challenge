/* Wellness Tracker - Top 5 race visualization.
   Animated time-lapse race: each racer is their own character avatar,
   positions replay the challenge day by day. Works on iPhone + Android:
   no libraries, GPU-friendly transforms, tap-only controls,
   honors prefers-reduced-motion. */
(function () {
  "use strict";

  var timer = null;
  var LANE_H = 68;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtPts(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
  }
  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  }

  function injectCSS() {
    if (document.getElementById("race-css")) return;
    var st = document.createElement("style");
    st.id = "race-css";
    st.textContent =
      ".race-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;"
      + "background:rgba(13,59,64,.92);padding:12px;box-sizing:border-box;}"
      + ".race-card{width:100%;max-width:520px;max-height:94vh;overflow-y:auto;background:#FAF6EF;border-radius:20px;"
      + "padding:18px 16px;box-sizing:border-box;box-shadow:0 18px 60px rgba(0,0,0,.4);}"
      + ".race-title{font-size:20px;font-weight:800;color:#0D3B40;margin:0;}"
      + ".race-sub{font-size:13px;color:#5b6b6b;margin:2px 0 4px;}"
      + ".race-day{font-size:13px;font-weight:700;color:#1E7A78;margin:8px 0 4px;min-height:18px;}"
      + ".race-track-wrap{position:relative;background:linear-gradient(180deg,#EAF3F7,#FAF6EF);"
      + "border:2px solid #1E7A78;border-radius:14px;overflow:hidden;}"
      + ".race-lane{position:absolute;left:0;right:0;display:flex;align-items:center;gap:8px;"
      + "padding:0 10px;box-sizing:border-box;transition:transform .45s ease;}"
      + ".race-pos{width:26px;height:26px;border-radius:50%;background:#0D3B40;color:#fff;font-size:13px;font-weight:800;"
      + "display:flex;align-items:center;justify-content:center;flex:none;}"
      + ".race-pos.lead{background:#D98F3C;}"
      + ".race-track{position:relative;flex:1;height:56px;}"
      + ".race-runner{position:absolute;top:50%;transform:translateY(-50%);transition:left .45s linear;"
      + "display:flex;align-items:center;gap:4px;}"
      + ".race-runner.racing .race-av{animation:race-bob .5s ease-in-out infinite;}"
      + "@keyframes race-bob{0%,100%{margin-top:0;}50%{margin-top:-5px;}}"
      + ".race-nm{font-size:11px;font-weight:700;color:#0D3B40;white-space:nowrap;"
      + "text-shadow:0 1px 0 #FAF6EF,0 0 4px #FAF6EF;}"
      + ".race-pts{font-size:12px;font-weight:800;color:#0D3B40;min-width:52px;text-align:right;flex:none;}"
      + ".race-finish{position:absolute;top:0;bottom:0;right:0;width:10px;"
      + "background:repeating-conic-gradient(#0D3B40 0 25%,#fff 0 50%) 0 0/10px 10px;opacity:.85;}"
      + ".race-winner{margin-top:12px;text-align:center;font-size:18px;font-weight:800;color:#0D3B40;display:none;}"
      + ".race-winner.show{display:block;animation:race-pop .5s ease;}"
      + "@keyframes race-pop{0%{transform:scale(.6);opacity:0;}100%{transform:scale(1);opacity:1;}}"
      + ".race-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"
      + "font-size:72px;font-weight:800;color:#D98F3C;text-shadow:0 3px 0 #0D3B40;pointer-events:none;}";
    document.head.appendChild(st);
  }

  function charOf(a) {
    if (a && typeof a === "object" && a.skin) return a;
    return (window.AVATARS && window.AVATARS[0]) || { skin: "#f1c9a5", hair: "short", hairColor: "#1d1d1d", shirt: "#0F6B8A" };
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    var ov = document.getElementById("race-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  function play(opts) {
    stop();
    injectCSS();
    var racers = opts.racers || [];
    var days = opts.days || [];
    if (racers.length < 2 || !days.length) return;

    var ov = document.createElement("div");
    ov.className = "race-overlay";
    ov.id = "race-overlay";
    var lanesH = racers.length * LANE_H;
    var lanesHtml = "";
    for (var li = 0; li < racers.length; li++) {
      var r = racers[li];
      lanesHtml += '<div class="race-lane" data-rid="' + esc(r.id) + '" style="height:' + LANE_H + "px;transform:translateY(" + (li * LANE_H) + 'px);">'
        + '<div class="race-pos" data-pos>-</div>'
        + '<div class="race-track"><div class="race-runner" style="left:0%;">'
        + '<span class="race-av">' + window.avatarSVG(charOf(r.avatar), 44) + "</span>"
        + '<span class="race-nm">' + esc(r.name) + "</span></div>"
        + '<div class="race-finish"></div></div>'
        + '<div class="race-pts" data-pts>0</div></div>';
    }
    ov.innerHTML =
      '<div class="race-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div><h2 class="race-title">Top ' + racers.length + " Race</h2>"
      + '<div class="race-sub">' + esc(opts.title || "Challenge") + "</div></div>"
      + '<button class="btn small ghost" id="race-close" type="button" style="flex:none;">Close</button></div>'
      + '<div class="race-day" id="race-day"></div>'
      + '<div class="race-track-wrap" id="race-lanes" style="height:' + lanesH + 'px;">' + lanesHtml + "</div>"
      + '<div class="race-winner" id="race-winner"></div>'
      + '<div style="text-align:center;margin-top:10px;"><button class="btn" id="race-replay" type="button" style="display:none;">Replay</button></div>'
      + "</div>";
    document.body.appendChild(ov);

    var close = function () { stop(); };
    document.getElementById("race-close").onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.getElementById("race-replay").onclick = function () { play(opts); };

    var laneEls = {};
    Array.prototype.forEach.call(ov.querySelectorAll(".race-lane"), function (el) {
      laneEls[el.getAttribute("data-rid")] = el;
    });

    function renderTick(day) {
      var order = racers.slice().sort(function (a, b) {
        return (day.totals[b.id] || 0) - (day.totals[a.id] || 0);
      });
      var max = 0, oi;
      for (oi = 0; oi < order.length; oi++) max = Math.max(max, day.totals[order[oi].id] || 0);
      if (max <= 0) max = 1;
      for (oi = 0; oi < order.length; oi++) {
        (function (rr, pos) {
          var el = laneEls[rr.id];
          if (!el) return;
          el.style.transform = "translateY(" + (pos * LANE_H) + "px)";
          var pct = Math.max(4, ((day.totals[rr.id] || 0) / max) * 88);
          var runner = el.querySelector(".race-runner");
          runner.style.left = pct + "%";
          runner.classList.add("racing");
          var posEl = el.querySelector("[data-pos]");
          posEl.textContent = pos + 1;
          if (pos === 0) posEl.classList.add("lead"); else posEl.classList.remove("lead");
          el.querySelector("[data-pts]").textContent = fmtPts(day.totals[rr.id] || 0);
        })(order[oi], oi);
      }
      document.getElementById("race-day").textContent = day.label;
    }

    function finish() {
      Array.prototype.forEach.call(ov.querySelectorAll(".race-runner"), function (el) {
        el.classList.remove("racing");
      });
      var last = days[days.length - 1];
      var winner = racers.slice().sort(function (a, b) {
        return (last.totals[b.id] || 0) - (last.totals[a.id] || 0);
      })[0];
      var w = document.getElementById("race-winner");
      w.innerHTML = "🏆 " + esc(winner.name) + " wins!";
      w.classList.add("show");
      document.getElementById("race-replay").style.display = "inline-block";
      try {
        if (window.CoteeMotion && window.CoteeMotion.confetti) {
          window.CoteeMotion.confetti({ count: 140, duration: 2800 });
          setTimeout(function () { window.CoteeMotion.confetti({ count: 70, duration: 1800 }); }, 800);
        }
      } catch (e) {}
    }

    var cd = document.createElement("div");
    cd.className = "race-count";
    ov.querySelector(".race-card").appendChild(cd);
    var steps = reducedMotion() ? [] : ["3", "2", "1", "GO!"];
    var si = 0, ti = 0;

    function runTicks() {
      if (reducedMotion()) {
        renderTick(days[days.length - 1]);
        finish();
        return;
      }
      timer = setInterval(function () {
        if (ti >= days.length) {
          clearInterval(timer); timer = null;
          setTimeout(finish, 650);
          return;
        }
        renderTick(days[ti]);
        ti++;
      }, 420);
    }

    if (!steps.length) { runTicks(); return; }
    var cdt = setInterval(function () {
      if (si >= steps.length) {
        clearInterval(cdt);
        if (cd.parentNode) cd.parentNode.removeChild(cd);
        runTicks();
        return;
      }
      cd.textContent = steps[si];
      si++;
    }, 550);
  }

  window.CoteeRace = { play: play, close: stop };
})();
