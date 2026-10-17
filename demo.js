/* Cotee Challenge - DEMO backend (no Supabase needed).
   A localStorage-backed shim implementing the slice of the Supabase JS API
   that app.js uses, so the full concept is testable on the phone with zero
   backend. Toggle it with the "Try the demo" button on the sign-in screen. */
(function () {
  "use strict";

  var DB_KEY = "cotee_demo_db";
  var FILE_PREFIX = "cotee_demo_file_";
  var SESSION_KEY = "cotee_demo_session";
  var FLAG_KEY = "cotee_demo";
  var DEMO_USER_ID = "demo-user-1";

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  }
  function ok(data, extra) {
    var r = { data: data, error: null };
    if (extra) for (var k in extra) r[k] = extra[k];
    return {
      then: function (resolve, reject) {
        try { resolve(r); } catch (e) { if (reject) reject(e); }
      }
    };
  }
  function rng(seed) {
    var s = seed;
    return function () {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  function seedActivities() {
    var rows = [
      ["Walking", "steps", 10, 1500], ["Running", "miles", 10, 1],
      ["Hiking", "miles", 10, 1], ["Cycling", "miles", 10, 3],
      ["Stationary bike", "minutes", 10, 15], ["Elliptical", "minutes", 10, 15],
      ["Rowing machine", "minutes", 10, 8], ["Jump rope", "minutes", 10, 8],
      ["Swimming", "laps", 10, 10], ["Water aerobics", "minutes", 10, 15],
      ["Pushups", "reps", 10, 50], ["Squats", "reps", 10, 50],
      ["Lunges", "reps", 10, 40], ["Sit-ups", "reps", 10, 50],
      ["Plank", "minutes", 10, 5], ["Burpees", "reps", 10, 20],
      ["Pull-ups", "reps", 10, 10], ["Dips", "reps", 10, 30],
      ["Jumping jacks", "reps", 10, 100], ["Weight lifting", "minutes", 10, 15],
      ["Resistance bands", "minutes", 10, 15], ["Yoga", "minutes", 10, 20],
      ["Pilates", "minutes", 10, 15], ["Stretching", "minutes", 10, 30],
      ["Tai chi", "minutes", 10, 20], ["Chair exercises", "minutes", 10, 20],
      ["Dancing", "minutes", 10, 15], ["Pickleball", "minutes", 10, 15],
      ["Tennis", "minutes", 10, 15], ["Basketball", "minutes", 10, 12],
      ["Soccer", "minutes", 10, 12], ["Golf (walking)", "minutes", 10, 30],
      ["Bowling", "minutes", 10, 30], ["Kayaking", "minutes", 10, 15],
      ["Gardening", "minutes", 10, 20]
    ];
    return rows.map(function (r, i) {
      return { id: i + 1, name: r[0], unit: r[1], points_per: r[2], per_quantity: r[3], sort_order: i + 1, active: true };
    });
  }

  function sensibleQty(a, R) {
    switch (a.unit) {
      case "reps": return 10 + Math.floor(R() * 50);
      case "steps": return 1000 + Math.floor(R() * 7000);
      case "miles": return Math.round((1 + R() * 5) * 10) / 10;
      case "minutes": return 10 + Math.floor(R() * 50);
      case "laps": return 5 + Math.floor(R() * 15);
      default: return 10;
    }
  }

  function seedDb() {
    var now = Date.now(), day = 24 * 3600 * 1000;
    var start = new Date(now - 3 * day); start.setHours(0, 0, 0, 0);
    var end = new Date(now + 11 * day); end.setHours(23, 59, 59, 999);
    var upStart = new Date(now + 14 * day); upStart.setHours(0, 0, 0, 0);
    var upEnd = new Date(now + 44 * day); upEnd.setHours(23, 59, 59, 999);

    var activities = seedActivities();
    var challenges = [
      { id: 1, title: "October Kickoff Classic", description: "First crew challenge. Log anything, every point counts.",
        starts_at: start.toISOString(), ends_at: end.toISOString(), target_points: 1500,
        created_by: null, created_at: new Date(now - 4 * day).toISOString() },
      { id: 2, title: "November Move More", description: "Monthly challenge. Fresh board, fresh start.",
        starts_at: upStart.toISOString(), ends_at: upEnd.toISOString(), target_points: 4000,
        created_by: null, created_at: new Date(now - day).toISOString() }
    ];

    var names = ["D. Carter", "R. Alvarez", "S. Kim", "J. Rivera", "M. Thompson", "L. Nguyen", "P. Johnson", "T. Baker"];
    var profiles = names.map(function (nm, i) {
      return { id: "demo-fake-" + (i + 1), email: null, display_name: nm,
        avatar: JSON.parse(JSON.stringify(AVATARS[(i * 3 + 1) % AVATARS.length])),
        is_admin: false, created_at: new Date(now - 5 * day).toISOString() };
    });

    var R = rng(42), entries = [], eid = 1;
    profiles.forEach(function (p) {
      var n = 3 + Math.floor(R() * 5);
      for (var k = 0; k < n; k++) {
        var a = activities[Math.floor(R() * activities.length)];
        var qty = sensibleQty(a, R);
        var created = new Date(start.getTime() + R() * (now - start.getTime()));
        entries.push({ id: eid++, user_id: p.id, activity_id: a.id, quantity: qty,
          points: Math.round(qty * a.points_per / a.per_quantity),
          proof_url: null, note: null, created_at: created.toISOString(), flagged: false });
      }
    });

    return { profiles: profiles, activities: activities, challenges: challenges, entries: entries,
      seq: { entries: eid, challenges: 3, activities: activities.length + 1 } };
  }

  /* ---------- tiny query builder ---------- */
  function Builder(db, table) {
    this.db = db; this.table = table;
    this.mode = "select"; this.payload = null;
    this.filters = []; this.orderBy = null; this.limitN = null;
    this.wantSingle = false; this.wantHead = false; this.wantCount = false;
    this.doneResult = null;
  }
  Builder.prototype.select = function (cols, opts) {
    this.mode = "select";
    if (opts && opts.head) this.wantHead = true;
    if (opts && opts.count === "exact") this.wantCount = true;
    return this;
  };
  Builder.prototype.insert = function (p) { this.mode = "insert"; this.payload = p; return this; };
  Builder.prototype.update = function (p) { this.mode = "update"; this.payload = p; return this; };
  Builder.prototype.delete = function () { this.mode = "delete"; return this; };
  Builder.prototype.upsert = function (p) {
    var arr = Array.isArray(p) ? p : [p], db = this.db;
    arr.forEach(function (r) {
      var i = db.profiles.findIndex(function (x) { return String(x.id) === String(r.id); });
      if (i >= 0) { for (var k in r) db.profiles[i][k] = r[k]; }
      else {
        if (r.is_admin == null) r.is_admin = false;
        r.created_at = r.created_at || new Date().toISOString();
        db.profiles.push(r);
      }
    });
    save(db);
    this.mode = "done"; this.doneResult = { data: arr, error: null };
    return this;
  };
  Builder.prototype.eq = function (c, v) { this.filters.push({ op: "eq", c: c, v: v }); return this; };
  Builder.prototype.not = function (c, op, v) { this.filters.push({ op: "not", c: c, oop: op, v: v }); return this; };
  Builder.prototype.gte = function (c, v) { this.filters.push({ op: "gte", c: c, v: v }); return this; };
  Builder.prototype.order = function (c, opts) {
    this.orderBy = { c: c, asc: !(opts && opts.ascending === false) }; return this;
  };
  Builder.prototype.limit = function (n) { this.limitN = n; return this; };
  Builder.prototype.maybeSingle = function () { this.wantSingle = true; return this; };

  Builder.prototype._rows = function () {
    var rows = this.db[this.table].slice(), self = this;
    this.filters.forEach(function (f) {
      rows = rows.filter(function (r) {
        var v = r[f.c];
        if (f.op === "eq") return String(v) === String(f.v);
        if (f.op === "gte") return v >= f.v;
        if (f.op === "not" && f.oop === "is") return v !== f.v;
        return true;
      });
    });
    if (this.orderBy) {
      var c = this.orderBy.c, asc = this.orderBy.asc;
      rows.sort(function (a, b) {
        var x = a[c], y = b[c];
        if (x < y) return asc ? -1 : 1;
        if (x > y) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.table === "entries") {
      var byId = {};
      this.db.activities.forEach(function (a) { byId[String(a.id)] = a; });
      rows = rows.map(function (r) {
        var copy = {}, k;
        for (k in r) copy[k] = r[k];
        var a = byId[String(r.activity_id)] || {};
        copy.activities = { name: a.name, unit: a.unit };
        return copy;
      });
    }
    return rows;
  };
  Builder.prototype.then = function (resolve, reject) {
    try {
      var db = this.db, out;
      if (this.mode === "done") { resolve(this.doneResult); return; }
      if (this.mode === "insert") {
        var arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        arr.forEach(function (r) {
          if (db[this.table] === db.entries) { r.id = db.seq.entries++; }
          else if (db[this.table] === db.challenges) { r.id = db.seq.challenges++; }
          else if (db[this.table] === db.activities) {
            r.id = db.seq.activities++;
            if (r.sort_order == null) r.sort_order = 99;
            if (r.active == null) r.active = true;
          }
          if (r.created_at == null && (this.table === "entries" || this.table === "challenges")) {
            r.created_at = new Date().toISOString();
          }
          if (this.table === "entries" && r.flagged == null) r.flagged = false;
          db[this.table].push(r);
        }, this);
        save(db);
        resolve({ data: arr, error: null }); return;
      }
      if (this.mode === "update" || this.mode === "delete") {
        var table = this.table;
        var rows = this._rows(), changes = this.payload;
        if (this.mode === "update") {
          rows.forEach(function (r) {
            var live = db[table].find(function (x) { return String(x.id) === String(r.id); });
            if (live) for (var k in changes) live[k] = changes[k];
          });
        } else {
          var ids = {};
          rows.forEach(function (r) { ids[String(r.id)] = true; });
          db[table] = db[table].filter(function (x) { return !ids[String(x.id)]; });
        }
        save(db);
        resolve({ data: rows, error: null }); return;
      }
      var all = this._rows();
      save(db);
      if (this.wantHead) { resolve({ data: [], count: all.length, error: null }); return; }
      if (this.wantSingle) { resolve({ data: all[0] || null, error: null }); return; }
      out = { data: all, error: null };
      if (this.wantCount) out.count = all.length;
      resolve(out);
    } catch (e) { if (reject) reject(e); }
  };

  /* ---------- rpc ---------- */
  function rpc(db, name, params) {
    if (name === "challenge_leaderboard") {
      var byUser = {};
      db.entries.forEach(function (e) {
        if (e.flagged) return;
        if (e.created_at < params.p_starts_at || e.created_at > params.p_ends_at) return;
        var g = byUser[e.user_id] || (byUser[e.user_id] = { total: 0, count: 0 });
        g.total += Number(e.points); g.count++;
      });
      var out = Object.keys(byUser).map(function (uid) {
        var p = db.profiles.find(function (x) { return String(x.id) === String(uid); }) || {};
        return { user_id: uid, display_name: p.display_name || "Member", avatar: p.avatar || null,
          total_points: byUser[uid].total, entry_count: byUser[uid].count };
      });
      out.sort(function (a, b) { return b.total_points - a.total_points; });
      return ok(out);
    }
    return ok(null, { error: { message: "unknown rpc" } });
  }

  /* ---------- auth ---------- */
  var listeners = [];
  function readSession() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  var Auth = {
    getSession: function () { return ok({ session: readSession() }); },
    onAuthStateChange: function (cb) {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe: function () {} } } };
    },
    signInWithOtp: function () {
      var session = { user: { id: DEMO_USER_ID, email: "demo@cotee.local" } };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
      setTimeout(function () {
        listeners.forEach(function (cb) { cb("SIGNED_IN", session); });
      }, 30);
      return ok({});
    },
    signOut: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(FLAG_KEY);
      } catch (e) {}
      setTimeout(function () {
        listeners.forEach(function (cb) { cb("SIGNED_OUT", null); });
      }, 30);
      return ok({});
    }
  };

  /* ---------- storage ---------- */
  function storage(db) {
    return {
      from: function () {
        return {
          upload: function (path, blob) {
            return new Promise(function (resolve) {
              try {
                var fr = new FileReader();
                fr.onload = function () {
                  try { localStorage.setItem(FILE_PREFIX + path, fr.result); } catch (e) {}
                  resolve({ error: null });
                };
                fr.onerror = function () { resolve({ error: { message: "upload failed" } }); };
                fr.readAsDataURL(blob);
              } catch (e) { resolve({ error: { message: "upload failed" } }); }
            });
          },
          getPublicUrl: function (path) {
            var url = null;
            try { url = localStorage.getItem(FILE_PREFIX + path); } catch (e) {}
            return { data: { publicUrl: url } };
          }
        };
      }
    };
  }

  window.DemoSupabase = function () {
    var db = load() || seedDb();
    save(db);
    return {
      auth: Auth,
      from: function (table) { return new Builder(db, table); },
      rpc: function (name, params) { return rpc(db, name, params); },
      storage: storage(db),
      __isDemo: true
    };
  };
  window.DemoSupabase.FLAG_KEY = FLAG_KEY;
  window.DemoSupabase.resetAll = function () {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) {
        if (k === DB_KEY || k === SESSION_KEY || k.indexOf(FILE_PREFIX) === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
  };
})();
