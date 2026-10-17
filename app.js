/* Wellness Tracker - app logic (Supabase backend, free tier) */
(function () {
  "use strict";


  var cfg = window.COTEE_CONFIG || {};
  var CONFIGURED = !!(cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 && window.supabase);
  var supabase = null;


  var state = {
    user: null,
    profile: null,
    activities: [],
    challenges: [],
    activeChallenge: null,
    boardChallengeId: null,
    logActivity: null,
    logProofFile: null,
    profilesById: {},
    obChar: JSON.parse(JSON.stringify(AVATARS[0])),
    obMode: "pick",
    epChar: null,
    epMode: "pick",
    editingActivityId: null,
    // gamification
    goal: null,
    goalWeekPoints: 0,
    badges: [],
    myBadgeIds: {},
    streak: 0,
    totalPoints: 0,
    distinctActivities: 0,
    entryCount: 0,
    levelName: "Rookie",
    levelPct: 0,
    levelNext: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtPts(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString("en-US");
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function fmtDateTime(iso) {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  /* ---------------- gamification: levels, streaks, goals, badges ---------------- */
  var LEVELS = [
    { min: 0, name: "Rookie" },
    { min: 500, name: "Contender" },
    { min: 1500, name: "Athlete" },
    { min: 3000, name: "Pro" },
    { min: 6000, name: "Champion" }
  ];

  function levelFor(total) {
    var idx = 0;
    for (var i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].min) idx = i;
    var cur = LEVELS[idx], nxt = LEVELS[idx + 1] || null;
    var pct = nxt ? Math.min(1, Math.max(0, (total - cur.min) / (nxt.min - cur.min))) : 1;
    return { name: cur.name, pct: pct, next: nxt ? nxt.name : null };
  }

  function weekStartDate(d) {
    var x = new Date(d.getTime());
    var dow = (x.getDay() + 6) % 7; // Monday = start of week
    x.setDate(x.getDate() - dow);
    return x.toISOString().slice(0, 10);
  }

  function dayKey(iso) { return String(iso).slice(0, 10); }

  function computeStreak(dayKeys) {
    var set = {};
    dayKeys.forEach(function (k) { set[k] = true; });
    var d = new Date();
    var key = dayKey(d.toISOString());
    if (!set[key]) {
      d.setDate(d.getDate() - 1);
      key = dayKey(d.toISOString());
      if (!set[key]) return 0;
    }
    var n = 0;
    while (set[key]) { n++; d.setDate(d.getDate() - 1); key = dayKey(d.toISOString()); }
    return n;
  }

  function progressBar(pct, color) {
    var p = Math.round(Math.min(1, Math.max(0, pct)) * 100);
    return '<div style="height:10px;border-radius:6px;background:rgba(13,59,64,.12);overflow:hidden;margin-top:6px;">'
      + '<div style="height:100%;width:' + p + '%;border-radius:6px;background:' + (color || "var(--sunset)") + ';transition:width .6s;"></div></div>';
  }

  function setMsg(id, text, kind) {
    var el = $(id);
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }

  var toastTimer = null;

  function toast(text) {
    var el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function showView(name) {
    ["auth", "onboarding", "main"].forEach(function (v) {
      $("view-" + v).classList.toggle("active", v === name);
    });
    window.scrollTo(0, 0);
  }

  function openModal(id) {
    $("modal-bg").classList.add("open");
    ["modal-challenge", "modal-activity", "modal-profile", "modal-badge", "modal-install"].forEach(function (m) {
      $(m).style.display = m === id ? "block" : "none";
    });
  }

  function closeModal() { $("modal-bg").classList.remove("open"); }

  /* ---------------- install prompt (Android one-tap, iOS guided steps) ---------------- */
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredPrompt = e; });
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(window.navigator.userAgent || ""); }
  function installSeen() { try { return localStorage.getItem("wt-install") === "done"; } catch (e) { return true; } }
  function markInstallSeen() { try { localStorage.setItem("wt-install", "done"); } catch (e) {} }
  function openInstall() {
    if (isStandalone()) { toast("Already installed. Look for the Wellness Tracker icon on your home screen."); return; }
    var steps = $("installSteps"), go = $("installGo");
    if (deferredPrompt) {
      $("installHint").textContent = "Add Wellness Tracker to your home screen for one-tap access, just like a real app.";
      steps.innerHTML = "";
      go.style.display = "";
    } else if (isIOS()) {
      $("installHint").textContent = "On iPhone it takes 3 quick taps:";
      steps.innerHTML = '<div style="background:var(--sand);border:1px solid var(--line);border-radius:12px;'
        + 'padding:12px 14px;margin:10px 0;font-size:15px;line-height:2;text-align:left;">'
        + '<div>1. Tap the <b>Share</b> button in Safari <span style="font-size:18px;">&#x2399;</span><br>'
        + '<span style="color:var(--muted);font-size:13px;">(the square with an arrow pointing up, at the bottom)</span></div>'
        + '<div>2. Scroll down and tap <b>Add to Home Screen</b></div>'
        + '<div>3. Tap <b>Add</b> in the top-right corner</div></div>';
      go.style.display = "none";
    } else {
      $("installHint").textContent = "Use your browser\u2019s \u201cInstall\u201d or \u201cAdd to Home Screen\u201d option to keep Wellness Tracker one tap away.";
      steps.innerHTML = "";
      go.style.display = "none";
    }
    openModal("modal-install");
  }
  function maybeInstallPrompt() { if (!isStandalone() && !installSeen()) openInstall(); }

  /* ---------------- web push ---------------- */
  var VAPID_PUBLIC_KEY = "BA3iMtv7fvb04mcUOA9MaRinzVIO906L4zqiEkr5iJh7BRkyP9fHHobrsb7gs1xJGuP5CENITh05CX6DGn9s8Ek";
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  }
  function pushSupported() {
    return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
  }
  async function refreshPushButton() {
    var b = $("btn-push");
    if (!b) return;
    if (!pushSupported()) { b.style.display = "none"; return; }
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      b.textContent = sub ? "\ud83d\udd15 Mute notifications" : "\ud83d\udd14 Enable notifications";
    } catch (e) { b.style.display = "none"; }
  }
  async function togglePush() {
    if (!pushSupported()) return;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase.from("cotee_push_subscriptions").delete().eq("user_id", state.user.id).eq("endpoint", sub.endpoint);
        toast("Notifications off.");
      } else {
        var perm = await Notification.requestPermission();
        if (perm !== "granted") { toast("Notifications blocked. Allow them in your browser settings."); return; }
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
        var kj = (sub.toJSON().keys) || {};
        var ins = await supabase.from("cotee_push_subscriptions").upsert(
          { user_id: state.user.id, endpoint: sub.endpoint, p256dh: kj.p256dh, auth: kj.auth },
          { onConflict: "user_id,endpoint" });
        if (ins.error) throw ins.error;
        toast("Notifications on.");
      }
    } catch (e) { toast("Could not change notification setting."); }
    refreshPushButton();
  }

  /* ---------------- badge popup ---------------- */
  function badgeProgress(key) {
    var P = {
      "first-log": [Math.min(state.entryCount, 1), 1, "log"],
      "streak-3": [Math.min(state.streak, 3), 3, "days"],
      "streak-7": [Math.min(state.streak, 7), 7, "days"],
      "streak-30": [Math.min(state.streak, 30), 30, "days"],
      "points-1000": [Math.min(state.totalPoints, 1000), 1000, "points"],
      "points-5000": [Math.min(state.totalPoints, 5000), 5000, "points"],
      "explorer": [Math.min(state.distinctActivities, 10), 10, "activities"]
    };
    if (P[key]) return { cur: P[key][0], target: P[key][1], unit: P[key][2] };
    if (key === "goal-crusher") {
      if (!state.goal) return { cur: 0, target: 0, unit: "set a weekly goal first" };
      var t = Number(state.goal.target_points);
      return { cur: Math.min(state.goalWeekPoints, t), target: t, unit: "points" };
    }
    return null;
  }
  function openBadge(key) {
    var b = null;
    for (var i = 0; i < state.badges.length; i++) {
      if (state.badges[i].key === key) { b = state.badges[i]; break; }
    }
    if (!b) return;
    var got = !!state.myBadgeIds[b.id];
    var pr = badgeProgress(key);
    $("badge-icon").textContent = b.icon || "\ud83c\udfc5";
    $("badge-name").textContent = b.name;
    $("badge-desc").textContent = b.description;
    $("badge-progress").innerHTML = got
      ? '<div style="font-weight:800;color:var(--teal);">Earned!</div>'
      : (pr && pr.target
        ? "<div>" + fmtPts(pr.cur) + " / " + fmtPts(pr.target) + " " + esc(pr.unit) + "</div>" + progressBar(pr.cur / pr.target)
        : "<div>" + esc(pr ? pr.unit : "") + "</div>");
    openModal("modal-badge");
  }

  function charOf(profile) {
    var a = profile && profile.avatar;
    if (a && typeof a === "object" && a.skin) return a;
    return AVATARS[0];
  }

  /* ---------------- ring ---------------- */
  function ringSVG(pct, label) {
    var c = 2 * Math.PI * 48;
    var p = Math.min(1, Math.max(0, pct));
    var off = c * (1 - p);
    return '<svg width="104" height="104" viewBox="0 0 110 110">'
      + '<circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="10"/>'
      + '<circle cx="55" cy="55" r="48" fill="none" stroke="#D98F3C" stroke-width="10" stroke-linecap="round"'
      + ' stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 55 55)"/>'
      + '<text x="55" y="63" text-anchor="middle" fill="#fff" font-size="20" font-weight="800">' + esc(label) + "</text></svg>";
  }

  /* ---------------- auth ---------------- */
  function watchAuth() {
    supabase.auth.onAuthStateChange(async function (event, session) {
      if (event === "SIGNED_IN" && session) await onSignedIn(session.user);
      if (event === "SIGNED_OUT") {
        state.user = null; state.profile = null;
        showView("auth");
      }
    });
  }

  async function init() {
    if (CONFIGURED) {
      supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    wireStatic();
    if (!supabase) {
      showView("auth");
      setMsg("auth-msg", "App is not connected yet. Add your Supabase keys in config.js (see SETUP.md).", "err");
      return;
    }
    var res = await supabase.auth.getSession();
    if (res.data && res.data.session) {
      await onSignedIn(res.data.session.user);
    } else {
      showView("auth");
    }
    watchAuth();
  }

  async function onSignedIn(user) {
    state.user = user;
    var res = await supabase.from("cotee_profiles").select("*").eq("id", user.id).maybeSingle();
    if (res.error) { toast("Could not load profile."); return; }
    if (!res.data) {
      state.obChar = JSON.parse(JSON.stringify(AVATARS[0]));
      state.obMode = "pick";
      var guess = (user.email || "").split("@")[0].replace(/[._-]+/g, " ");
      $("ob-name").value = guess;
      paintOnboarding();
      showView("onboarding");
    } else {
      state.profile = res.data;
      await loadApp();
      setTimeout(maybeInstallPrompt, 800);
      refreshPushButton();
    }
  }

  /* ---------------- onboarding + creator ---------------- */
  function renderPresetGrid(containerId, getChar, onPick) {
    var box = $(containerId);
    box.innerHTML = "";
    AVATARS.forEach(function (p, i) {
      var d = document.createElement("div");
      d.className = "avatar-pick" + (JSON.stringify(getChar()) === JSON.stringify(p) ? " sel" : "");
      d.innerHTML = avatarSVG(p, 72);
      d.onclick = function () { onPick(JSON.parse(JSON.stringify(p))); };
      box.appendChild(d);
    });
  }

  function paintCreator(pfx, ch) {
    $(pfx + "-preview").innerHTML = avatarSVG(ch, 120);
    var skinRow = $(pfx + "-skin"); skinRow.innerHTML = "";
    SKIN_TONES.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "swatch" + (ch.skin === s ? " sel" : "");
      d.style.background = s;
      d.onclick = function () { ch.skin = s; paintCreator(pfx, ch); };
      skinRow.appendChild(d);
    });
    var hairRow = $(pfx + "-hair"); hairRow.innerHTML = "";
    var hairLabels = { short: "Short", long: "Long", bun: "Bun", curly: "Curly", bald: "Bald" };
    HAIR_STYLES.forEach(function (h) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pill" + (ch.hair === h ? " sel" : "");
      b.textContent = hairLabels[h];
      b.onclick = function () { ch.hair = h; paintCreator(pfx, ch); };
      hairRow.appendChild(b);
    });
    var hcRow = $(pfx + "-haircolor"); hcRow.innerHTML = "";
    HAIR_COLORS.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "swatch" + (ch.hairColor === c ? " sel" : "");
      d.style.background = c;
      d.onclick = function () { ch.hairColor = c; paintCreator(pfx, ch); };
      hcRow.appendChild(d);
    });
    var shRow = $(pfx + "-shirt"); shRow.innerHTML = "";
    SHIRT_COLORS.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "swatch" + (ch.shirt === c ? " sel" : "");
      d.style.background = c;
      d.onclick = function () { ch.shirt = c; paintCreator(pfx, ch); };
     shRow.appendChild(d);      
   });
    
  }
  function paintOnboarding() {
    var onPick = function (p) {
      state.obChar = p;
      renderPresetGrid("avatar-grid", function () { return state.obChar; }, onPick);
    };
    renderPresetGrid("avatar-grid", function () { return state.obChar; }, onPick);
    paintCreator("cr", state.obChar);
    setObMode(state.obMode);
  }

  function setObMode(mode) {
    state.obMode = mode;
    $("mode-pick").classList.toggle("sel", mode === "pick");
    $("mode-create").classList.toggle("sel", mode === "create");
    $("pick-pane").style.display = mode === "pick" ? "block" : "none";
    $("create-pane").style.display = mode === "create" ? "block" : "none";
  }

  function setEpMode(mode) {
    state.epMode = mode;
    $("ep-mode-pick").classList.toggle("sel", mode === "pick");
    $("ep-mode-create").classList.toggle("sel", mode === "create");
    $("ep-pick-pane").style.display = mode === "pick" ? "block" : "none";
    $("ep-create-pane").style.display = mode === "create" ? "block" : "none";
  }

  /* ---------------- main load ---------------- */
  async function loadApp() {
    if (!CONFIGURED) { $("setup-banner").style.display = "block"; }
    var a = await supabase.from("cotee_activities").select("*").eq("active", true).order("sort_order");
    state.activities = a.data || [];
    var c = await supabase.from("cotee_challenges").select("*").order("starts_at", { ascending: false });
    state.challenges = c.data || [];
    var now = new Date();
    var live = state.challenges.filter(function (ch) {
      return new Date(ch.starts_at) <= now && now <= new Date(ch.ends_at);
    });
    live.sort(function (x, y) { return new Date(y.starts_at) - new Date(x.starts_at); });
    state.activeChallenge = live[0] || null;
    if (!state.boardChallengeId && state.challenges.length) {
      state.boardChallengeId = state.activeChallenge ? state.activeChallenge.id : state.challenges[0].id;
    }
    var p = await supabase.from("cotee_profiles").select("id, display_name, avatar").eq("id", state.user.id).maybeSingle();
    if (p.data) state.profilesById[state.user.id] = p.data;
    var all = await supabase.from("cotee_profiles").select("id, display_name, avatar");
    (all.data || []).forEach(function (pr) { state.profilesById[pr.id] = pr; });
    var isAdmin = !!state.profile.is_admin;
    $("tabbtn-admin").classList.toggle("hidden", !isAdmin);
    $("admin-challenge-btn").style.display = isAdmin ? "block" : "none";
    $("hdr-avatar").innerHTML = avatarSVG(charOf(state.profile), 44);
    $("hdr-name").textContent = state.profile.display_name;
    await loadGamification();
    renderLogGrid();
    showView("main");
    switchTab("home");
    refreshHeader();
  }

  async function refreshHeader() {
    var weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    var r = await supabase.from("cotee_entries").select("points")
      .eq("user_id", state.user.id).eq("flagged", false).gte("created_at", weekAgo);
    var total = (r.data || []).reduce(function (s, e) { return s + Number(e.points); }, 0);
    $("hdr-points").textContent = fmtPts(total);
    var rank = "";
    if (state.activeChallenge) {
      var rows = await leaderboardRows(state.activeChallenge);
      var idx = rows.findIndex(function (x) { return x.user_id === state.user.id; });
      if (idx >= 0) rank = "Rank #" + (idx + 1) + " in " + state.activeChallenge.title;
    }
    $("hdr-rank").textContent = rank;
  }

  async function leaderboardRows(ch) {
    var r = await supabase.rpc("cotee_leaderboard", {
      p_starts_at: ch.starts_at,
      p_ends_at: ch.ends_at
    });
    return r.data || [];
  }

  /* ---------------- gamification data ---------------- */
  async function loadGamification() {
    var uid = state.user.id;
    var r = await supabase.from("cotee_entries").select("points, activity_id, created_at")
      .eq("user_id", uid).eq("flagged", false);
    var rows = r.data || [];
    var total = 0, acts = {}, days = {};
    var ws = weekStartDate(new Date());
    var weekPts = 0;
    rows.forEach(function (e) {
      total += Number(e.points) || 0;
      acts[e.activity_id] = true;
      var dk = dayKey(e.created_at);
      days[dk] = true;
      if (dk >= ws) weekPts += Number(e.points) || 0;
    });
    state.totalPoints = total;
    state.entryCount = rows.length;
    state.distinctActivities = Object.keys(acts).length;
    state.streak = computeStreak(Object.keys(days));
    state.goalWeekPoints = weekPts;
    var lv = levelFor(total);
    state.levelName = lv.name;
    state.levelPct = lv.pct;
    state.levelNext = lv.next;
    var g = await supabase.from("cotee_goals").select("*")
      .eq("user_id", uid).eq("week_start", ws).maybeSingle();
    state.goal = (g.data || null);
    var b = await supabase.from("cotee_badges").select("*").order("sort_order");
    state.badges = b.data || [];
    var mb = await supabase.from("cotee_user_badges").select("badge_id").eq("user_id", uid);
    var have = {};
    (mb.data || []).forEach(function (x) { have[x.badge_id] = true; });
    state.myBadgeIds = have;
  }

  async function checkBadges() {
    await loadGamification();
    var earned = [];
    var rules = [
      { key: "first-log", ok: state.entryCount >= 1 },
      { key: "streak-3", ok: state.streak >= 3 },
      { key: "streak-7", ok: state.streak >= 7 },
      { key: "streak-30", ok: state.streak >= 30 },
      { key: "points-1000", ok: state.totalPoints >= 1000 },
      { key: "points-5000", ok: state.totalPoints >= 5000 },
      { key: "explorer", ok: state.distinctActivities >= 10 },
      { key: "goal-crusher", ok: !!(state.goal && state.goalWeekPoints >= Number(state.goal.target_points)) }
    ];
    for (var i = 0; i < rules.length; i++) {
      var b = null;
      for (var j = 0; j < state.badges.length; j++) {
        if (state.badges[j].key === rules[i].key) { b = state.badges[j]; break; }
      }
      if (b && rules[i].ok && !state.myBadgeIds[b.id]) {
        var ins = await supabase.from("cotee_user_badges")
          .insert({ user_id: state.user.id, badge_id: b.id });
        if (!ins.error) { state.myBadgeIds[b.id] = true; earned.push(b); }
      }
    }
    return earned;
  }

  function celebrateBadge(b) {
    try {
      var el = $("celebrate");
      if (!el) return;
      var trophy = el.querySelector(".trophy");
      if (trophy) trophy.textContent = b.icon || "\ud83c\udfc5";
      el.querySelector(".cel-title").textContent = "Badge earned!";
      el.querySelector(".cel-pts").textContent = b.name;
      el.classList.add("show");
      if (window.CoteeMotion && window.CoteeMotion.confetti) {
        window.CoteeMotion.confetti({ count: 120, duration: 2500 });
      }
    } catch (e) {}
  }

  function lbRowHtml(row, pos, isMe) {
    var pr = state.profilesById[row.user_id] || {};
    var nm = pr.display_name || row.display_name || "Member";
    return '<div class="lb-row' + (isMe ? " me" : "") + '">'
      + '<span class="pos">' + pos + "</span>"
      + '<span class="ava">' + avatarSVG(charOf({ avatar: row.avatar }), 44) + "</span>"
      + '<span class="nm">' + esc(nm) + (isMe ? " (you)" : "")
      + "<small>" + Number(row.entry_count) + " logs</small></span>"
      + '<span class="pt">' + fmtPts(row.total_points) + "</span></div>";
  }

  /* ---------------- home ---------------- */
  async function renderHome() {
    var hero = $("hero");
    var ch = state.activeChallenge;
    if (!ch) {
      hero.innerHTML = '<div class="hero"><div class="kicker">WELLNESS TRACKER</div>'
        + "<h2>No active challenge</h2>"
        + '<p class="desc">Log activity any time. It counts toward the next challenge automatically.</p></div>';
      $("home-board").innerHTML = '<div class="empty">The board lights up when a challenge starts.</div>';
      return;
    }
    var rows = await leaderboardRows(ch);
    var me = rows.find(function (r) { return r.user_id === state.user.id; });
    var mine = me ? Number(me.total_points) : 0;
    var leader = rows.length ? Number(rows[0].total_points) : 0;
    var denom = ch.target_points ? Number(ch.target_points) : (leader || 1);
    var pct = denom > 0 ? mine / denom : 0;
    var label = Math.round(Math.min(1, pct) * 100) + "%";
    var sub = ch.target_points
      ? fmtPts(mine) + " of " + fmtPts(ch.target_points) + " pts"
      : fmtPts(mine) + " pts" + (leader ? " · leader has " + fmtPts(leader) : "");
    hero.innerHTML = '<div class="hero"><div class="kicker">ACTIVE CHALLENGE</div>'
      + "<h2>" + esc(ch.title) + "</h2>"
      + '<div class="dates">' + fmtDate(ch.starts_at) + " - " + fmtDate(ch.ends_at) + " · " + rows.length + " people in</div>"
      + (ch.description ? '<p class="desc">' + esc(ch.description) + "</p>" : "")
      + '<div class="ring-wrap">' + ringSVG(pct, label) + "</div>"
      + '<div class="big">' + esc(sub) + "</div></div>";
    $("home-board").innerHTML = rows.length
      ? rows.slice(0, 5).map(function (r, i) { return lbRowHtml(r, i + 1, r.user_id === state.user.id); }).join("")
      : '<div class="empty">No points yet. Be the first to log.</div>';
  }

  /* ---------------- challenges tab ---------------- */
  function challengeStatus(ch) {
    var now = new Date();
    if (new Date(ch.starts_at) > now) return "soon";
    if (new Date(ch.ends_at) < now) return "done";
    return "live";
  }

  function renderChallenges() {
    var box = $("challenges-list");
    if (!state.challenges.length) {
      box.innerHTML = '<div class="empty">No challenges yet.</div>';
      return;
    }
    var labels = { live: "LIVE", soon: "UPCOMING", done: "ENDED" };
    box.innerHTML = state.challenges.map(function (ch) {
      var st = challengeStatus(ch);
      var del = state.profile.is_admin
        ? '<div class="row-btns"><button class="btn small danger" data-del-ch="' + ch.id + '">Delete</button></div>' : "";
      return '<div class="card"><span class="chip ' + st + '">' + labels[st] + "</span>"
        + '<div style="font-size:17px;font-weight:800;margin:6px 0 2px;">' + esc(ch.title) + "</div>"
        + '<div style="font-size:13px;color:var(--muted);">' + fmtDate(ch.starts_at) + " - " + fmtDate(ch.ends_at)
        + (ch.target_points ? " · target " + fmtPts(ch.target_points) + " pts" : "") + "</div>"
        + (ch.description ? '<div style="font-size:14px;margin-top:6px;">' + esc(ch.description) + "</div>" : "")
        + del + "</div>";
    }).join("");
    box.querySelectorAll("[data-del-ch]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("Delete this challenge? Logged points stay, but the challenge disappears.")) return;
        var r = await supabase.from("cotee_challenges").delete().eq("id", b.getAttribute("data-del-ch"));
        if (r.error) toast("Could not delete.");
        else { toast("Challenge deleted."); await loadApp(); }
      };
    });
  }

  /* ---------------- board tab ---------------- */
  async function renderBoard() {
    var sel = $("board-select");
    sel.innerHTML = state.challenges.map(function (ch) {
      return '<option value="' + ch.id + '"' + (String(ch.id) === String(state.boardChallengeId) ? " selected" : "") + ">"
        + esc(ch.title) + "</option>";
    }).join("");
    var ch = state.challenges.find(function (x) { return String(x.id) === String(state.boardChallengeId); });
    if (!ch) { $("board-list").innerHTML = '<div class="empty">Pick a challenge.</div>'; return; }
    var rows = await leaderboardRows(ch);
    $("board-list").innerHTML = rows.length
      ? rows.map(function (r, i) { return lbRowHtml(r, i + 1, r.user_id === state.user.id); }).join("")
      : '<div class="empty">No points logged in this window yet.</div>';
    var rb = $("race-open");
    if (rb) {
      rb.style.display = "block";
      rb.onclick = function () { openRace(); };
    }
  }

  /* ---------------- top-5 race ---------------- */
  async function openRace() {
    var ch = state.challenges.find(function (x) { return String(x.id) === String(state.boardChallengeId); });
    if (!ch) { toast("Pick a challenge first."); return; }
    toast("Loading the race...");
    var rows = await leaderboardRows(ch);
    var top = rows.slice(0, 5).filter(function (r) { return Number(r.total_points) > 0; });
    if (top.length < 2) { toast("Need at least 2 racers with points."); return; }
    var ids = top.map(function (r) { return r.user_id; });
    var q = await supabase.from("cotee_entries").select("user_id, points, created_at")
      .in("user_id", ids).eq("flagged", false)
      .gte("created_at", ch.starts_at).lte("created_at", ch.ends_at)
      .order("created_at", { ascending: true });
    var entries = q.data || [];
    var start = new Date(ch.starts_at).getTime();
    var end = Math.min(new Date(ch.ends_at).getTime(), Date.now());
    if (end <= start) end = start + 86400000;
    var ticks = Math.min(24, Math.max(1, Math.ceil((end - start) / 86400000)));
    var cum = {}, days = [], ei = 0;
    ids.forEach(function (id) { cum[id] = 0; });
    for (var t = 0; t < ticks; t++) {
      var tickEnd = start + ((end - start) * (t + 1)) / ticks;
      while (ei < entries.length && new Date(entries[ei].created_at).getTime() <= tickEnd) {
        cum[entries[ei].user_id] = (cum[entries[ei].user_id] || 0) + (Number(entries[ei].points) || 0);
        ei++;
      }
      var snap = {};
      ids.forEach(function (id) { snap[id] = cum[id]; });
      days.push({ label: fmtDate(new Date(tickEnd).toISOString()) + " · day " + (t + 1) + " of " + ticks, totals: snap });
    }
    var racers = top.map(function (r, i) {
      var pr = state.profilesById[r.user_id] || {};
      return {
        id: r.user_id,
        name: pr.display_name || r.display_name || ("Racer " + (i + 1)),
        avatar: r.avatar
      };
    });
    if (window.CoteeRace) window.CoteeRace.play({ racers: racers, days: days, title: ch.title });
    else toast("Race is still loading, try again in a moment.");
  }

  /* ---------------- log tab ---------------- */
  function renderLogGrid() {
    var grid = $("log-activity-grid");
    grid.innerHTML = "";
    state.activities.forEach(function (a) {
      var d = document.createElement("div");
      d.className = "act-pick" + (state.logActivity && state.logActivity.id === a.id ? " sel" : "");
      d.innerHTML = esc(a.name) + "<small>" + fmtPts(a.points_per) + " pts per " + fmtPts(a.per_quantity) + " " + esc(a.unit) + "</small>";
      d.onclick = function () {
        state.logActivity = a;
        $("log-unit").textContent = a.unit;
        renderLogGrid();
        updatePointsPreview();
      };
      grid.appendChild(d);
    });
    if (!state.logActivity && state.activities.length) {
      state.logActivity = state.activities[0];
      $("log-unit").textContent = state.logActivity.unit;
      renderLogGrid();
    }
    updatePointsPreview();
  }

  function calcPoints() {
    if (!state.logActivity) return 0;
    var qty = parseFloat($("log-qty").value) || 0;
    if (qty <= 0) return 0;
    return Math.round(qty * Number(state.logActivity.points_per) / Number(state.logActivity.per_quantity));
  }

  function updatePointsPreview() {
    $("log-points").textContent = "+" + fmtPts(calcPoints()) + " pts";
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxDim = 1200, w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) {
          var s = maxDim / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error("compress failed"));
        }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  async function uploadProof(file, userId) {
    var blob = await compressImage(file);
    var path = userId + "/" + Date.now() + ".jpg";
    var up = await supabase.storage.from("cotee-proofs").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw up.error;
    return supabase.storage.from("cotee-proofs").getPublicUrl(path).data.publicUrl;
  }

  async function submitLog() {
    if (!state.logActivity) { setMsg("log-msg", "Pick an activity first.", "err"); return; }
    var qty = parseFloat($("log-qty").value) || 0;
    if (qty <= 0) { setMsg("log-msg", "Enter how many " + state.logActivity.unit + ".", "err"); return; }
    var btn = $("log-submit");
    btn.disabled = true;
    setMsg("log-msg", "Saving...", "");
    try {
      var proofUrl = null;
      if (state.logProofFile) proofUrl = await uploadProof(state.logProofFile, state.user.id);
      var points = calcPoints();
      var ins = await supabase.from("cotee_entries").insert({
        user_id: state.user.id,
        activity_id: state.logActivity.id,
        quantity: qty,
        points: points,
        proof_url: proofUrl,
        note: $("log-note").value.trim() || null
      });
      if (ins.error) throw ins.error;
      $("log-qty").value = "";
      $("log-note").value = "";
      $("log-proof").value = "";
      $("log-proof-preview").innerHTML = "";
      state.logProofFile = null;
      updatePointsPreview();
      setMsg("log-msg", "+" + fmtPts(points) + " pts logged.", "ok");
      toast("Logged +" + fmtPts(points) + " pts");
      var newBadges = await checkBadges();
      refreshHeader();
      renderHome();
      renderProfile();
      (newBadges || []).forEach(function (b, i) {
        setTimeout(function () { celebrateBadge(b); }, 900 * (i + 1));
      });
    } catch (e) {
      setMsg("log-msg", "Could not save: " + (e.message || e), "err");
    }
    btn.disabled = false;
  }

  /* ---------------- profile tab ---------------- */
  async function renderProfile() {
    $("pf-avatar-big").innerHTML = avatarSVG(charOf(state.profile), 96);
    $("pf-name").textContent = state.profile.display_name;
    $("pf-email").textContent = state.profile.email || "";
    await loadGamification();
    var total = state.totalPoints;
    var lvlLine = state.levelNext ? "Next: " + esc(state.levelNext) : "Max level reached";
    var streakLine = state.streak > 0
      ? "\ud83d\udd25 " + state.streak + "-day streak"
      : "Log today to start a streak";
    var goalHtml;
    if (state.goal) {
      var gpct = Math.min(1, state.goalWeekPoints / Math.max(1, Number(state.goal.target_points)));
      goalHtml = '<div style="display:flex;justify-content:space-between;align-items:baseline;">'
        + "<b>My weekly goal</b>"
        + '<span style="font-weight:800;color:var(--deep);">' + fmtPts(state.goalWeekPoints) + " / " + fmtPts(state.goal.target_points) + " pts</span></div>"
        + progressBar(gpct)
        + (state.goalWeekPoints >= Number(state.goal.target_points)
          ? '<div style="margin-top:6px;font-weight:700;color:var(--teal);">\ud83c\udfaf Goal crushed this week!</div>' : "");
    } else {
      goalHtml = "<b>My weekly goal</b>"
        + '<div style="font-size:13px;color:var(--muted);margin:4px 0 8px;">Set a points target for this week.</div>';
    }
    goalHtml += '<div style="display:flex;gap:8px;margin-top:10px;">'
      + '<input type="number" id="goal-target" placeholder="e.g. 300" min="1" style="flex:1;" value="'
      + (state.goal ? esc(String(state.goal.target_points)) : "") + '">'
      + '<button class="btn small" id="goal-save" type="button">Save</button></div>';
    var badgeHtml = state.badges.length ? state.badges.map(function (b) {
      var got = !!state.myBadgeIds[b.id];
      return '<div data-badge="' + esc(b.key) + '" style="text-align:center;cursor:pointer;opacity:' + (got ? "1" : ".35")
        + ";filter:" + (got ? "none" : "grayscale(1)") + ';">'
        + '<div style="font-size:30px;">' + esc(b.icon) + "</div>"
        + '<div style="font-size:11px;font-weight:700;">' + esc(b.name) + "</div></div>";
    }).join("") : '<div class="empty">Badges are coming soon.</div>';
    $("pf-stats").innerHTML =
      '<div class="card" style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><b>Level: ' + esc(state.levelName) + "</b>"
      + '<span style="font-size:12px;color:var(--muted);">' + esc(lvlLine) + "</span></div>"
      + progressBar(state.levelPct, "var(--teal)")
      + '<div style="margin-top:8px;font-size:14px;">' + esc(streakLine) + "</div></div>"
      + '<div class="card" style="margin-bottom:12px;">' + goalHtml + "</div>"
      + '<h3 style="margin:14px 0 8px;">Badges</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px;">' + badgeHtml + "</div>"
      + '<div style="display:flex; gap:10px; text-align:center;margin-top:12px;">'
      + '<div style="flex:1;"><div style="font-size:22px;font-weight:800;color:var(--deep);">' + fmtPts(total) + '</div><div style="font-size:12px;color:var(--muted);">total points</div></div>'
      + '<div style="flex:1;"><div style="font-size:22px;font-weight:800;color:var(--deep);">' + state.entryCount + '</div><div style="font-size:12px;color:var(--muted);">logs</div></div></div>';

    $("pf-stats").querySelectorAll("[data-badge]").forEach(function (el) {
      el.onclick = function () { openBadge(el.getAttribute("data-badge")); };
    });
    var gs = $("goal-save");
    if (gs) gs.onclick = async function () {
      var t = parseFloat($("goal-target").value);
      if (!(t > 0)) { toast("Enter a target above 0."); return; }
      var ws = weekStartDate(new Date());
      var up = await supabase.from("cotee_goals").upsert(
        { user_id: state.user.id, week_start: ws, target_points: t },
        { onConflict: "user_id,week_start" }
      );
      if (up.error) { toast("Could not save goal."); return; }
      toast("Weekly goal saved.");
      var nb = await checkBadges();
      renderProfile();
      refreshHeader();
      (nb || []).forEach(function (b, i) { setTimeout(function () { celebrateBadge(b); }, 900 * (i + 1)); });
    };
    var e = await supabase.from("cotee_entries").select("*, cotee_activities(name, unit)")
      .eq("user_id", state.user.id).order("created_at", { ascending: false }).limit(20);
    var rows = e.data || [];
    $("pf-entries").innerHTML = rows.length ? rows.map(function (en) {
      var an = (en.cotee_activities && en.cotee_activities.name) || "Activity";
      var un = (en.cotee_activities && en.cotee_activities.unit) || "";
      return '<div class="card"><div style="display:flex; justify-content:space-between; align-items:center;">'
        + "<div><b>" + esc(an) + "</b> · " + esc(String(en.quantity)) + " " + esc(un)
        + '<div style="font-size:12px;color:var(--muted);">' + fmtDateTime(en.created_at)
        + (en.note ? " · " + esc(en.note) : "") + "</div></div>"
        + '<div style="font-weight:800;color:var(--deep);">+' + fmtPts(en.points) + "</div></div>"
        + (en.proof_url ? '<img src="' + esc(en.proof_url) + '" style="width:100%;border-radius:12px;margin-top:8px;" loading="lazy">' : "")
        + '<div class="row-btns"><button class="btn small ghost" data-del-en="' + en.id + '">Delete</button></div></div>';
    }).join("") : '<div class="empty">Nothing logged yet.</div>';
    $("pf-entries").querySelectorAll("[data-del-en]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("Delete this entry?")) return;
        var del = await supabase.from("cotee_entries").delete().eq("id", b.getAttribute("data-del-en"));
        if (del.error) toast("Could not delete.");
        else { toast("Entry deleted."); renderProfile(); refreshHeader(); renderHome(); }
      };
    });
  }

  /* ---------------- admin ---------------- */
  async function renderAdmin() {
    var allActs = await supabase.from("cotee_activities").select("id, name, unit");
    var actById = {};
    (allActs.data || []).forEach(function (a) { actById[String(a.id)] = a; });
    // proof queue
    var q = await supabase.from("cotee_entries").select("id, user_id, activity_id, quantity, points, proof_url, note, created_at, flagged")
      .not("proof_url", "is", null).order("created_at", { ascending: false }).limit(40);
    var rows = q.data || [];
    var box = $("admin-proof-queue");
    if (!rows.length) {
      box.innerHTML = '<div class="empty">No proof photos yet.</div>';
    } else {
      box.innerHTML = rows.map(function (en) {
        var pr = state.profilesById[en.user_id] || {};
        var act = actById[String(en.activity_id)] || {};
        return '<div class="card">'
          + '<div style="display:flex; gap:10px; align-items:center;"><span style="width:36px;height:36px;display:block;">' + avatarSVG(charOf({ avatar: pr.avatar }), 36) + "</span>"
          + "<div><b>" + esc(pr.display_name || "Member") + "</b>"
          + '<div style="font-size:12px;color:var(--muted);">' + esc(act.name || "") + " · " + esc(String(en.quantity)) + " " + esc(act.unit || "")
          + " · +" + fmtPts(en.points) + " pts · " + fmtDateTime(en.created_at) + "</div></div></div>"
          + '<img class="proof-img" src="' + esc(en.proof_url) + '" loading="lazy">'
          + (en.note ? '<div style="font-size:13px;">' + esc(en.note) + "</div>" : "")
          + (en.flagged ? '<div><span class="chip done">FLAGGED</span></div>' : "")
          + '<div class="row-btns">'
          + '<button class="btn small ghost" data-flag-en="' + en.id + '" data-flagged="' + (en.flagged ? "1" : "0") + '">' + (en.flagged ? "Unflag" : "Flag") + "</button>"
          + '<button class="btn small danger" data-del-en="' + en.id + '">Remove</button>'
          + "</div></div>";
      }).join("");
      box.querySelectorAll("[data-del-en]").forEach(function (b) {
        b.onclick = async function () {
          if (!confirm("Remove this entry and its points?")) return;
          var del = await supabase.from("cotee_entries").delete().eq("id", b.getAttribute("data-del-en"));
          if (del.error) toast("Could not remove.");
          else { toast("Entry removed."); renderAdmin(); }
        };
      });
      box.querySelectorAll("[data-flag-en]").forEach(function (b) {
        b.onclick = async function () {
          var to = b.getAttribute("data-flagged") === "1" ? false : true;
          var up = await supabase.from("cotee_entries").update({ flagged: to }).eq("id", b.getAttribute("data-flag-en"));
          if (up.error) toast("Could not update.");
          else { toast(to ? "Flagged (hidden from board)." : "Unflagged."); renderAdmin(); }
        };
      });
    }
    // activities editor
    var all = await supabase.from("cotee_activities").select("*").order("sort_order");
    var abox = $("admin-activities");
    abox.innerHTML = '<table class="admin-table"><tr><th>Activity</th><th>Pts</th><th>Per</th><th></th></tr>'
      + (all.data || []).map(function (a) {
        return "<tr><td><b>" + esc(a.name) + "</b><br><small style='color:var(--muted)'>" + esc(a.unit) + (a.active ? "" : " · off") + "</small></td>"
          + '<td><input type="number" id="ap-' + a.id + '" value="' + esc(a.points_per) + '" step="any" style="width:64px;"></td>'
          + '<td><input type="number" id="aq-' + a.id + '" value="' + esc(a.per_quantity) + '" step="any" style="width:64px;"></td>'
          + '<td><button class="btn small secondary" data-save-act="' + a.id + '">Save</button> '
          + '<button class="btn small ghost" data-toggle-act="' + a.id + '" data-active="' + (a.active ? "1" : "0") + '">' + (a.active ? "Off" : "On") + "</button></td></tr>";
      }).join("") + "</table>";
    abox.querySelectorAll("[data-save-act]").forEach(function (b) {
      b.onclick = async function () {
        var id = b.getAttribute("data-save-act");
        var up = await supabase.from("cotee_activities").update({
          points_per: parseFloat($("ap-" + id).value) || 0,
          per_quantity: parseFloat($("aq-" + id).value) || 1
        }).eq("id", id);
        if (up.error) toast("Could not save.");
        else { toast("Point rule saved."); await loadApp(); }
      };
    });
    abox.querySelectorAll("[data-toggle-act]").forEach(function (b) {
      b.onclick = async function () {
        var to = b.getAttribute("data-active") === "1" ? false : true;
        var up = await supabase.from("cotee_activities").update({ active: to }).eq("id", b.getAttribute("data-toggle-act"));
        if (up.error) toast("Could not update.");
        else { toast(to ? "Activity on." : "Activity off."); await loadApp(); }
      };
    });
  }

  /* ---------------- tabs ---------------- */
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("on", t.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".tabpane").forEach(function (p) { p.style.display = "none"; });
    $("tab-" + name).style.display = "block";
    window.scrollTo(0, 0);
    if (name === "home") renderHome();
    if (name === "challenges") renderChallenges();
    if (name === "board") renderBoard();
    if (name === "profile") renderProfile();
    if (name === "admin") renderAdmin();
  }

  /* ---------------- static wiring ---------------- */
  function wireStatic() {
    var pendingEmail = null;
    function showAuthStep(which) {
      $("auth-step-email").style.display = which === "email" ? "block" : "none";
      $("auth-step-code").style.display = which === "code" ? "block" : "none";
    }
    async function sendCode(email) {
      if (!supabase) { setMsg("auth-msg", "Sign-in is not connected yet.", "err"); return; }
      if (!email || email.indexOf("@") === -1) { setMsg("auth-msg", "Enter a valid email.", "err"); return; }
      setMsg("auth-msg", "Sending...", "");
      var r = await supabase.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (r.error) { setMsg("auth-msg", r.error.message, "err"); return; }
      pendingEmail = email;
      $("auth-sent-to").textContent = email;
      setMsg("auth-msg", "", "");
      setMsg("auth-msg2", "Code sent. Check your email.", "ok");
      showAuthStep("code");
      $("auth-code").focus();
    }
    $("auth-send").onclick = function () { sendCode($("auth-email").value.trim()); };
    $("auth-verify").onclick = async function () {
      var code = $("auth-code").value.trim();
      if (code.length < 6) { setMsg("auth-msg2", "Enter the 6-digit code.", "err"); return; }
      setMsg("auth-msg2", "Verifying...", "");
      var r = await supabase.auth.verifyOtp({ email: pendingEmail, token: code, type: "email" });
      if (r.error) setMsg("auth-msg2", "That code didn't work. Check and try again.", "err");
    };
    $("auth-resend").onclick = function (e) { e.preventDefault(); if (pendingEmail) sendCode(pendingEmail); };
    $("auth-change").onclick = function (e) { e.preventDefault(); pendingEmail = null; showAuthStep("email"); };
    $("mode-pick").onclick = function () { setObMode("pick"); };
    $("mode-create").onclick = function () { setObMode("create"); };
    $("ob-save").onclick = async function () {
      var name = $("ob-name").value.trim();
      if (!name) { setMsg("ob-msg", "Add your name.", "err"); return; }
      setMsg("ob-msg", "Saving...", "");
      var r = await supabase.from("cotee_profiles").upsert({
        id: state.user.id,
        email: state.user.email,
        display_name: name,
        avatar: state.obChar
      });
      if (r.error) setMsg("ob-msg", r.error.message, "err");
      else { state.profile = null; await onSignedIn(state.user); }
    };
    document.querySelectorAll(".tab").forEach(function (t) {
      t.onclick = function () { switchTab(t.getAttribute("data-tab")); };
    });
    $("board-select").onchange = function () {
      state.boardChallengeId = $("board-select").value;
      renderBoard();
    };
    $("log-qty").oninput = updatePointsPreview;
    $("log-proof").onchange = function () {
      var f = $("log-proof").files[0];
      state.logProofFile = f || null;
      $("log-proof-preview").innerHTML = f
        ? '<img src="' + URL.createObjectURL(f) + '" style="max-width:100%;border-radius:12px;margin-top:8px;">' : "";
    };
    $("log-submit").onclick = submitLog;
    $("btn-signout").onclick = async function () { await supabase.auth.signOut(); };

    $("btn-install").onclick = openInstall;
    $("btn-push").onclick = togglePush;
    $("installLater").onclick = function () { markInstallSeen(); closeModal(); };
    $("installGo").onclick = async function () {
      markInstallSeen(); closeModal();
      if (deferredPrompt) { try { await deferredPrompt.prompt(); } catch (e) {} deferredPrompt = null; }
    };

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
    }
    $("btn-edit-profile").onclick = function () {
      state.epChar = JSON.parse(JSON.stringify(charOf(state.profile)));
      state.epMode = "pick";
      $("ep-name").value = state.profile.display_name;
      var onEpPick = function (p) {
        state.epChar = p;
        renderPresetGrid("ep-avatar-grid", function () { return state.epChar; }, onEpPick);
      };
      renderPresetGrid("ep-avatar-grid", function () { return state.epChar; }, onEpPick);
      paintCreator("ep-cr", state.epChar);
      setEpMode("pick");
      setMsg("ep-msg", "", "");
      openModal("modal-profile");
    };
    $("ep-mode-pick").onclick = function () { setEpMode("pick"); };
    $("ep-mode-create").onclick = function () { setEpMode("create"); };
    $("ep-save").onclick = async function () {
      var name = $("ep-name").value.trim();
      if (!name) { setMsg("ep-msg", "Add your name.", "err"); return; }
      var r = await supabase.from("cotee_profiles").update({ display_name: name, avatar: state.epChar }).eq("id", state.user.id);
      if (r.error) setMsg("ep-msg", r.error.message, "err");
      else { closeModal(); toast("Profile saved."); await loadApp(); }
    };
    $("ep-cancel").onclick = closeModal;
    $("badge-close").onclick = closeModal;
    $("btn-new-challenge").onclick = function () {
      var now = new Date();
      var pad = function (n) { return String(n).padStart(2, "0"); };
      var fmt = function (d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
      };
      $("cf-start").value = fmt(now);
      $("cf-end").value = fmt(new Date(now.getTime() + 7 * 24 * 3600 * 1000));
      $("cf-title").value = ""; $("cf-desc").value = ""; $("cf-target").value = "";
      setMsg("cf-msg", "", "");
      openModal("modal-challenge");
    };
    $("cf-cancel").onclick = closeModal;
    $("cf-save").onclick = async function () {
      var title = $("cf-title").value.trim();
      var start = $("cf-start").value, end = $("cf-end").value;
      if (!title) { setMsg("cf-msg", "Give it a title.", "err"); return; }
      if (!start || !end) { setMsg("cf-msg", "Pick start and end.", "err"); return; }
      if (new Date(end) <= new Date(start)) { setMsg("cf-msg", "End must be after start.", "err"); return; }
      var target = parseFloat($("cf-target").value);
      var r = await supabase.from("cotee_challenges").insert({
        title: title,
        description: $("cf-desc").value.trim() || null,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        target_points: isNaN(target) ? null : target,
        created_by: state.user.id
      });
      if (r.error) setMsg("cf-msg", r.error.message, "err");
      else { closeModal(); toast("Challenge created."); await loadApp(); }
    };
    $("btn-new-activity").onclick = function () {
      state.editingActivityId = null;
      $("af-heading").textContent = "New activity";
      $("af-name").value = ""; $("af-unit").value = "reps";
      $("af-points").value = "10"; $("af-per").value = "20";
      setMsg("af-msg", "", "");
      openModal("modal-activity");
    };
    $("af-cancel").onclick = closeModal;
    $("af-save").onclick = async function () {
      var name = $("af-name").value.trim();
      var pts = parseFloat($("af-points").value), per = parseFloat($("af-per").value);
      if (!name) { setMsg("af-msg", "Name the activity.", "err"); return; }
      if (!(pts > 0) || !(per > 0)) { setMsg("af-msg", "Points and quantity must be above 0.", "err"); return; }
      var maxSort = state.activities.reduce(function (m, a) { return Math.max(m, a.sort_order || 0); }, 0);
      var r = await supabase.from("cotee_activities").insert({
        name: name, unit: $("af-unit").value,
        points_per: pts, per_quantity: per, sort_order: maxSort + 1, active: true
      });
      if (r.error) setMsg("af-msg", r.error.message, "err");
      else { closeModal(); toast("Activity added."); await loadApp(); }
    };
    $("modal-bg").addEventListener("click", function (e) {
      if (e.target === $("modal-bg")) closeModal();
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
