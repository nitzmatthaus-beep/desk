/* Paper-Desk Terminal. Look adapted from Calibrain Harness
   (Copyright (c) 2026 zadescoxp and Calibrain Harness contributors, MIT).
   Full notice: terminal.css. This file binds data.json and optional factory.json.
   No orders, no exchange connection. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.boot();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TZ = "Europe/Rome";
  var VIEWS = ["desk", "books", "factory", "health", "log"];
  var S = {
    D: null,
    F: null,
    fState: "load",
    view: "desk",
    bookId: null,
    series: "book",
    range: "all",
    zoom: null,
    mode: "candle",
    dataErr: false,
    lastCheck: null,
    busy: false,
    hover: null,
    chart: null,
    hint: "",
    rz: 0
  };

  function numOrNull(v) {
    if (v == null || v === "" || typeof v === "boolean") return null;
    var n = typeof v === "number" ? v : +v;
    return Number.isFinite(n) ? n : null;
  }

  function gateState(value, op, thr) {
    var v = numOrNull(value);
    var t = numOrNull(thr);
    if (v == null || t == null) return { v: v, pass: null };
    var pass = false;
    if (op === ">") pass = v > t;
    else if (op === "<") pass = v < t;
    else if (op === ">=") pass = v >= t;
    else pass = false;
    return { v: v, pass: pass };
  }

  function stepsToCandles(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var prev = i ? pts[i - 1].v : pts[i].v;
      var c = pts[i].v;
      out.push({
        t: pts[i].t,
        ms: pts[i].ms,
        o: prev,
        h: Math.max(prev, c),
        l: Math.min(prev, c),
        c: c
      });
    }
    return out;
  }

  function selftest() {
    var fails = [];
    function eq(name, got, exp) {
      if (got !== exp) fails.push(name + " got " + got + " exp " + exp);
    }
    eq("sharpe fail", gateState(-0.25, ">", 1).pass, false);
    eq("tiny fail", gateState(0.0033, ">", 1).pass, false);
    eq("null value", gateState(null, ">", 1).pass, null);
    eq("null thr", gateState(2, ">", null).pass, null);
    eq("dd fail", gateState(0.378, "<", 0.2).pass, false);
    eq("dd pass", gateState(0.199, "<", 0.2).pass, true);
    eq("closes ge", gateState(40, ">=", 40).pass, true);
    eq("closes lt", gateState(39, ">=", 40).pass, false);
    eq("sharpe edge", gateState(1, ">", 1).pass, false);
    eq("dsr edge", gateState(0.95, ">", 0.95).pass, false);
    eq("pbo edge", gateState(0.3, "<", 0.3).pass, false);
    eq("bad number", gateState("x", ">", 1).pass, null);
    eq("alarm live", isLiveAlarm({ valid: true }), true);
    eq("alarm missing", isLiveAlarm({ kind: "FEED" }), true);
    eq("alarm false", isLiveAlarm({ valid: false }), false);
    eq("alarm empty", isLiveAlarm(null), false);
    eq("hide sum flag", hideSummedTotals({ legacy_non_additive: true }), true);
    eq("hide sum missing", hideSummedTotals({}), true);
    eq("hide sum null", hideSummedTotals(null), true);
    eq("show explicit sum", hideSummedTotals({ legacy_non_additive: false }), false);
    eq("opens", countOpens([{ open: [{}, {}] }, { open: [] }, { open: [{}] }]), 3);
    var candles = stepsToCandles([{ t: "a", ms: 1, v: 10 }, { t: "b", ms: 2, v: 12 }]);
    eq("open", candles[1].o, 10);
    eq("close", candles[1].c, 12);
    eq("high", candles[1].h, 12);
    eq("low", candles[1].l, 10);
    if (!fails.length) return "ok";
    throw new Error(fails.join("; "));
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function fmtDec(v, max) {
    var n = numOrNull(v);
    if (n == null) return null;
    var s = n.toFixed(max);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    if (s === "-0") s = "0";
    return s.replace(".", ",");
  }

  function signedDec(v, max) {
    var n = numOrNull(v);
    if (n == null) return "–";
    var s = fmtDec(n, max);
    return n > 0 ? "+" + s : s;
  }

  function eur(v) {
    var n = numOrNull(v);
    if (n == null) return "–";
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function sgnEur(v) {
    var n = numOrNull(v);
    if (n == null) return "–";
    return (n > 0 ? "+" : "") + eur(n);
  }

  function pct(v) {
    var n = numOrNull(v);
    if (n == null) return "–";
    var s = (n * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
    return n > 0 ? "+" + s : s;
  }

function fmtPctFrac(v) {
  var n = numOrNull(v);
  if (n == null) return "–";
  return fmtDec(n * 100, 1) + " %";
}

  function fmtInt(v) {
    var n = numOrNull(v);
    if (n == null) return "–";
    return Math.round(n).toLocaleString("de-DE");
  }

  function clsSign(v) {
    var n = numOrNull(v);
    if (n == null || n === 0) return "";
    return n > 0 ? "up" : "dn";
  }

  function yn(v) {
    if (v == null || v === "") return "–";
    if (v === true || v === "true") return "ja";
    if (v === false || v === "false") return "nein";
    return esc(v);
  }

  function fmtDay(s) {
    var d = new Date(s);
    if (Number.isNaN(+d)) return "";
    return d.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  }

  function fmtTs(s) {
    if (s == null || s === "") return "–";
    var d = new Date(s);
    if (Number.isNaN(+d)) return esc(s);
    return d.toLocaleString("de-DE", {
      timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  }

  function fmtAge(min) {
    var n = numOrNull(min);
    if (n == null) return "–";
    if (n < 1) return Math.max(0, Math.round(n * 60)) + " s";
    if (n < 90) return Math.round(n) + " min";
    return (n / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " h";
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function books() {
    return S.D && Array.isArray(S.D.books) ? S.D.books : [];
  }

  function bookById(id) {
    var list = books();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function seriesPts(raw) {
    var out = [];
    var list = arr(raw);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!Array.isArray(p) || p.length < 2) continue;
      var ms = +new Date(p[0]);
      var v = numOrNull(p[1]);
      if (!Number.isFinite(ms) || v == null) continue;
      out.push({ t: p[0], ms: ms, v: v });
    }
    out.sort(function (a, b) { return a.ms - b.ms; });
    return out;
  }

  function tagPass(pass) {
    if (pass === true) return ' <span class="tag long">PASS</span>';
    if (pass === false) return ' <span class="tag short">FAIL</span>';
    return "";
  }

  function metricHtml(value, op, thr, text) {
    var g = gateState(value, op, thr);
    var cls = g.pass === true ? "up" : g.pass === false ? "dn" : "";
    return '<span class="' + cls + '">' + text + "</span>" + tagPass(g.pass);
  }

  function td(label, html, cls) {
    return '<td class="' + (cls || "") + '" data-l="' + esc(label) + '">' + html + "</td>";
  }

  function ths(labels, rights) {
    return "<thead><tr>" + labels.map(function (lb, i) {
      return '<th class="' + (rights && rights[i] ? "r" : "") + '">' + esc(lb) + "</th>";
    }).join("") + "</tr></thead>";
  }

  function dotOf(h) {
    if (!h) return "warn";
    if (h.state === "inaktiv") return "off";
    if (h.state === "erwartet") return "warn";
    if (h.ok === true || h.state === "ok") return "ok";
    if (h.ok === false) return "bad";
    return "warn";
  }

  function heatBg(ret) {
    if (ret == null) return "background:#141414";
    var t = Math.max(-1, Math.min(1, ret / 0.12));
    if (t === 0) return "background:#141414";
    var a = (0.25 + Math.abs(t) * 0.7).toFixed(3);
    var rgb = t > 0 ? "58,208,138" : "255,92,92";
    return "background:rgba(" + rgb + "," + a + ")";
  }

  function saveScroll() {
    var out = [];
    var nodes = document.querySelectorAll("[data-scroll]");
    for (var i = 0; i < nodes.length; i++) out.push([nodes[i].id, nodes[i].scrollTop]);
    return out;
  }

  function restoreScroll(saved) {
    for (var i = 0; i < saved.length; i++) {
      var el = document.getElementById(saved[i][0]);
      if (el) el.scrollTop = saved[i][1];
    }
  }

  function gateHead(prefix, op, value, asPct) {
    var n = numOrNull(value);
    if (n == null) return prefix;
    var shown = asPct ? fmtDec(n * 100, 1) + "%" : fmtDec(n, 4);
    return prefix + " " + op + shown;
  }

  function verdictHtml(c) {
    var v = c && c.verdict;
    var cls = "";
    if (typeof v === "string") {
      var u = v.toUpperCase();
      if (u === "PASS") cls = "up";
      else if (u === "FAIL") cls = "dn";
    }
    var text = v == null || v === "" ? "–" : esc(v);
    var diag = c && c.diagnostic === true ? ' <span class="tag amb" title="nur Diagnose-Fenster">DIAG</span>' : "";
    return '<span class="' + cls + '">' + text + "</span>" + diag;
  }

  function hideSummedTotals(total) {
    if (!total) return true;
    return total.legacy_non_additive !== false;
  }

  function countOpens(list) {
    var n = 0;
    arr(list).forEach(function (b) { n += arr(b && b.open).length; });
    return n;
  }

  function isLiveAlarm(a) {
    return !!a && typeof a === "object" && a.valid !== false;
  }

  function alarmText(a) {
    var why = a && a.why ? String(a.why) : "";
    var extra = a && a.invalid_why ? String(a.invalid_why) : "";
    if (why && extra) return why + " · " + extra;
    return why || extra;
  }

  function logRows() {
    var rows = [];
    if (!S.D) return rows;
    arr(S.D.alerts).forEach(function (a) {
      if (!a || typeof a !== "object") return;
      rows.push({
        t: a.at || a.ts || "",
        src: a.src || a.book || "WATCH",
        kind: a.severity || a.kind || "ALERT",
        text: a.text || a.msg || a.message || a.why || ""
      });
    });
    arr((S.D.ops || {}).alarms).forEach(function (a) {
      if (!isLiveAlarm(a)) return;
      rows.push({
        t: a.at || "",
        src: a.book || "OPS",
        kind: a.kind || "ALARM",
        text: alarmText(a)
      });
    });
    rows.sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    return rows;
  }

  function falseAlarmRows() {
    var rows = [];
    if (!S.D) return rows;
    arr((S.D.ops || {}).alarms).forEach(function (a) {
      if (!a || typeof a !== "object" || a.valid !== false) return;
      rows.push({
        t: a.at || "",
        src: a.book || "OPS",
        kind: "FEHLALARM",
        text: alarmText(a)
      });
    });
    rows.sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); });
    return rows;
  }

  function logTable(rows) {
    if (!rows.length) return '<div class="empty"><b>KEINE DATEN</b>Keine Alarme.</div>';
    var body = rows.map(function (r) {
      var full = String(r.text || "");
      return "<tr>" +
        td("Zeit", esc(fmtTs(r.t))) +
        td("Quelle", esc(r.src), "sym") +
        td("Art", esc(r.kind)) +
        td("Text", '<span class="clip" title="' + esc(full) + '">' + esc(full) + "</span>", "clip") +
        "</tr>";
    }).join("");
    return '<table class="t cards">' + ths(["Zeit", "Quelle", "Art", "Text"]) + "<tbody>" + body + "</tbody></table>";
  }

  function bookRows(list) {
    return list.map(function (b) {
      if (!b) return "";
      var sel = b.id === S.bookId ? " sel" : "";
      var openN = arr(b.open).length;
      return '<tr class="click' + sel + '" data-book="' + esc(b.id) + '">' +
        td("Buch", esc(b.id), "sym") +
        td("Status", esc(b.cls_label || b.status || "–")) +
        td("Equity", eur(b.equity), "r") +
        td("PnL", '<span class="' + clsSign(b.pnl) + '">' + sgnEur(b.pnl) + "</span>", "r") +
        td("Ret", '<span class="' + clsSign(b.ret) + '">' + pct(b.ret) + "</span>", "r") +
        td("DD", '<span class="' + clsSign(b.dd) + '">' + pct(b.dd) + "</span>", "r") +
        td("Open", fmtInt(openN), "r") +
        "</tr>";
    }).join("");
  }

  function renderBooks(targetId, list) {
    var el = document.getElementById(targetId);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>Keine Bücher.</div>';
      return;
    }
    el.innerHTML = '<table class="t cards">' +
      ths(["Buch", "Status", "Equity", "PnL", "Ret", "DD", "Open"], [0, 0, 1, 1, 1, 1, 1]) +
      "<tbody>" + bookRows(list) + "</tbody></table>";
  }

  function stripCell(label, value, sub, raw) {
    var cls = raw == null ? "" : clsSign(raw);
    return '<div class="cell"><div class="l">' + esc(label) + '</div><div class="n ' + cls + '">' + value + '</div><div class="s">' + esc(sub || "") + "</div></div>";
  }

  function renderStrip() {
    var el = document.getElementById("strip");
    if (!el) return;
    var opens = countOpens(books());
    var nBooks = books().length;
    var html;
    if (S.D && !hideSummedTotals(S.D.total)) {
      var t = S.D.total;
      html = stripCell("Equity", eur(t.equity), "Summe") +
        stripCell("PnL", sgnEur(t.pnl), "seit Start", t.pnl) +
        stripCell("PnL 24h", sgnEur(t.pnl24), t.pnl24_src || "", t.pnl24) +
        stripCell("PnL 7d", sgnEur(t.pnl7d), t.pnl7d_src || "", t.pnl7d) +
        stripCell("Max DD", pct(t.maxdd), "gesamt", t.maxdd) +
        stripCell("Open", fmtInt(opens), "gelistet") +
        stripCell("Bücher", fmtInt(nBooks), "geladen");
    } else {
      var main = bookById("main") || bookById(S.bookId) || books()[0] || null;
      html = stripCell("Main", eur(main && main.equity), main ? (main.name || main.id) : "je Buch") +
        stripCell("PnL", sgnEur(main && main.pnl), "eigener Start", main && main.pnl) +
        stripCell("Open", fmtInt(opens), "alle Bücher") +
        stripCell("Bücher", fmtInt(nBooks), "geladen");
    }
    el.innerHTML = html;
  }

  function renderRegime() {
    var el = document.getElementById("regime");
    if (!el) return;
    var R = (S.D && S.D.regime) || {};
    var G = R.gate || {};
    var dist = "–";
    var c = numOrNull(R.close);
    var e = numOrNull(R.ema100);
    if (c != null && e) dist = pct(c / e - 1);
    var rows = [
      ["Filter", R.filter == null || R.filter === "" ? "–" : esc(R.filter)],
      ["1D / EMA", (c == null ? "–" : fmtDec(c, 1)) + " / " + (e == null ? "–" : fmtDec(e, 1))],
      ["Abstand", '<span class="' + clsSign(c != null && e ? c / e - 1 : null) + '">' + dist + "</span>"],
      ["BTC jetzt", c == null && R.btc_now == null ? "–" : (numOrNull(R.btc_now) == null ? "–" : fmtDec(R.btc_now, 1))],
      ["risk_on", yn(G.risk_on)],
      ["Long", G.long_open == null ? "–" : (G.long_open ? "offen" : "zu")],
      ["Short", G.short_open == null ? "–" : (G.short_open ? "offen" : "zu")],
      ["4H", numOrNull(G.c4h) == null ? "–" : fmtDec(G.c4h, 1)],
      ["Floor", numOrNull(G.floor) == null ? "–" : fmtDec(G.floor, 0)],
      ["Regime", numOrNull(G.regime) == null ? "–" : fmtDec(G.regime, 0)],
      ["Stand", esc(G.time || "–")]
    ];
    var kv = '<div class="kv">' + rows.map(function (r) {
      return '<div class="k">' + esc(r[0]) + '</div><div class="v">' + r[1] + "</div>";
    }).join("") + "</div>";
    var rule = R.rule || G.rule || "";
    el.innerHTML = kv + (rule ? '<div class="note">' + esc(rule) + "</div>" : "");
  }

  function renderPos() {
    var el = document.getElementById("pos");
    if (!el) return;
    var rows = [];
    books().forEach(function (b) {
      arr(b && b.open).forEach(function (o) {
        if (o && typeof o === "object") rows.push(Object.assign({ bookname: b.id }, o));
      });
    });
    var count = document.getElementById("pos-count");
    if (count) count.textContent = String(countOpens(books()));
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>Keine offenen Positionen.</div>';
      return;
    }
    var body = rows.map(function (o) {
      var side = String(o.side || "");
      var sideCls = side === "LONG" ? "tag long" : side === "SHORT" ? "tag short" : "tag flat";
      return "<tr>" +
        td("Buch", esc(o.book || o.bookname || "–"), "sym") +
        td("Sym", esc(o.sym || "–")) +
        td("Seite", '<span class="' + sideCls + '">' + esc(side || "–") + "</span>") +
        td("uPnL", '<span class="' + clsSign(o.upnl) + '">' + sgnEur(o.upnl) + "</span>", "r") +
        td("R", '<span class="' + clsSign(o.R) + '">' + signedDec(o.R, 2) + "</span>", "r") +
        td("Entry", fmtDec(o.entry, 4) || "–", "r") +
        "</tr>";
    }).join("");
    el.innerHTML = '<table class="t cards">' + ths(["Buch", "Sym", "Seite", "uPnL", "R", "Entry"], [0, 0, 0, 1, 1, 1]) + "<tbody>" + body + "</tbody></table>";
  }

  function renderHeat() {
    var el = document.getElementById("heat");
    if (!el) return;
    var list = books();
    if (!list.length) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>Keine Bücher.</div>';
      return;
    }
    el.innerHTML = '<div class="heat">' + list.map(function (b) {
      if (!b) return "";
      var ret = numOrNull(b.ret);
      var on = b.id === S.bookId ? " on" : "";
      return '<button type="button" class="tile' + on + '" data-book="' + esc(b.id) + '" style="' + heatBg(ret) + '">' +
        '<span class="id">' + esc(b.id) + "</span>" +
        '<span class="v ' + clsSign(ret) + '">' + pct(ret) + "</span>" +
        '<span class="s">' + esc(b.cls_label || b.status || "") + "</span></button>";
    }).join("") + "</div>";
  }

  function renderHealthCompact() {
    var el = document.getElementById("health");
    if (!el) return;
    var list = arr(S.D && S.D.health);
    var ok = 0, bad = 0, other = 0;
    list.forEach(function (h) {
      var d = dotOf(h);
      if (d === "ok") ok++;
      else if (d === "bad") bad++;
      else other++;
    });
    var count = document.getElementById("health-count");
    if (count) count.textContent = ok + " OK · " + bad + " BAD · " + other;
    if (!list.length) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>Keine Health-Zeilen.</div>';
      return;
    }
    el.innerHTML = '<table class="t"><thead><tr><th>Job</th><th class="r">Alter</th><th>Stand</th></tr></thead><tbody>' +
      list.map(function (h) {
        return "<tr><td><span class=\"dot " + dotOf(h) + "\"></span>" + esc(h && h.name) + "</td><td class=\"r\">" +
          fmtAge(h && h.age_min) + "</td><td>" + esc((h && (h.state || (h.ok == null ? "" : String(h.ok)))) || "–") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function renderLogCompact() {
    var el = document.getElementById("log");
    var rows = logRows();
    var count = document.getElementById("log-count");
    if (count) count.textContent = rows.length ? String(rows.length) : "0";
    if (el) el.innerHTML = logTable(rows);
  }

  function renderBooksView() {
    var el = document.getElementById("books-full");
    if (!el) return;
    var note = "";
    if (S.D && S.D.overview && S.D.overview.note) note = '<div class="note">' + esc(S.D.overview.note) + "</div>";
    var summary = "";
    if (S.D && S.D.overview && S.D.overview.by_cls) {
      var labels = S.D.overview.cls_label || {};
      summary = '<div class="note">' + Object.keys(S.D.overview.by_cls).map(function (k) {
        var n = Array.isArray(S.D.overview.by_cls[k]) ? S.D.overview.by_cls[k].length : null;
        return esc(labels[k] || k) + " " + (n == null ? "–" : n);
      }).join(" · ") + "</div>";
    }
    var host = document.createElement("div");
    host.id = "books-table";
    el.innerHTML = summary + note;
    el.appendChild(host);
    renderBooks("books-table", books());
  }

  function renderHealthView() {
    var el = document.getElementById("health-full");
    if (!el) return;
    if (!S.D) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>data.json fehlt.</div>';
      return;
    }
    var list = arr(S.D.health);
    var jobs = list.length ? '<table class="t cards">' + ths(["Job", "Lauf", "Alter", "Stand", "Info"]) + "<tbody>" +
      list.map(function (h) {
        var info = h && h.info != null ? String(h.info) : "";
        return "<tr>" + td("Job", '<span class="dot ' + dotOf(h) + '"></span>' + esc(h && h.name)) +
          td("Lauf", fmtTs(h && h.at)) + td("Alter", fmtAge(h && h.age_min), "r") +
          td("Stand", esc((h && h.state) || "–")) +
          td("Info", '<span class="clip" title="' + esc(info) + '">' + esc(info || "–") + "</span>", "clip") + "</tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>KEINE DATEN</b></div>';
    var q = arr(S.D.quality);
    var quality = q.length ? q.map(function (item) {
      return '<div class="note"><b class="amb">' + esc(item && item.book) + " · " + esc(item && item.what) + "</b><br>" + esc(item && item.text) + "</div>";
    }).join("") : '<div class="note">Keine Qualitätsnotizen.</div>';
    var p = S.D.poller || {};
    var poller = '<div class="kv">' +
      kv("Stand", esc(p.state || "–")) + kv("Alter", fmtAge(p.age_min)) +
      kv("Läufe", fmtInt(p.n_runs)) + kv("Plan", fmtInt(p.n_sched)) +
      kv("Delay med", fmtInt(p.delay_med_s) + " s") + kv("Delay max", fmtInt(p.delay_max_s) + " s") +
      "</div>";
    var watch = arr(S.D.ops && S.D.ops.exit_watch);
    var watchHtml = watch.length ? '<table class="t cards">' + ths(["Desk", "Stand", "Alter", "OK 1h", "Busy", "Err"], [0, 0, 1, 1, 1, 1]) + "<tbody>" +
      watch.map(function (w) {
        return "<tr>" + td("Desk", esc(w && w.desk), "sym") + td("Stand", esc(w && w.status)) +
          td("Alter", fmtAge(w && w.age_min), "r") + td("OK 1h", fmtInt(w && w.ok_1h), "r") +
          td("Busy", fmtInt(w && w.busy_1h), "r") + td("Err", fmtInt(w && w.err_1h), "r") + "</tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>KEINE DATEN</b></div>';
    el.innerHTML =
      panel("SY", "HEALTH", jobs) +
      panel("Q", "QUALITY", quality) +
      '<div class="grid-fac">' + panel("PL", "POLLER", poller) + panel("EX", "EXIT WATCH", watchHtml) + "</div>";
  }

  function kv(k, v) {
    return '<div class="k">' + esc(k) + '</div><div class="v">' + v + "</div>";
  }

  function panel(code, title, body, right) {
    return '<section class="pnl"><div class="ph"><span class="code">' + esc(code) + "</span>" + esc(title) +
      (right ? '<span class="ph-r">' + right + "</span>" : "") + '</div><div class="pb tight scroll">' + body + "</div></section>";
  }

  function renderLogView() {
    var el = document.getElementById("log-full");
    if (!el) return;
    if (!S.D) {
      el.innerHTML = '<div class="empty"><b>KEINE DATEN</b>data.json fehlt.</div>';
      return;
    }
    var guards = arr(S.D.ops && S.D.ops.guards24);
    var gHtml = guards.length ? '<table class="t cards">' + ths(["Buch", "Guard", "N", "Zuletzt", "Detail"]) + "<tbody>" +
      guards.map(function (g) {
        var detail = g && g.detail != null ? String(g.detail) : "";
        return "<tr>" + td("Buch", esc(g && g.book), "sym") + td("Guard", esc(g && g.guard)) +
          td("N", fmtInt(g && g.n), "r") + td("Zuletzt", fmtTs(g && g.last)) +
          td("Detail", '<span class="clip" title="' + esc(detail) + '">' + esc(detail || "–") + "</span>", "clip") + "</tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>KEINE DATEN</b>Keine Schutzregeln in 24 h.</div>';
    var falseRows = falseAlarmRows();
    var falseHtml = falseRows.length ? panel("FA", "FEHLALARM", logTable(falseRows), String(falseRows.length)) : "";
    el.innerHTML = panel("LG", "ALERTS", logTable(logRows())) + falseHtml + panel("GD", "GUARDS 24H", gHtml);
  }

  function factoryAbsent(title, text) {
    return '<section class="pnl"><div class="ph"><span class="code">F3</span>FACTORY</div><div class="pb"><div class="empty"><b>' +
      esc(title) + "</b>" + esc(text) + "</div></div></section>";
  }

  function renderFactory() {
    var el = document.getElementById("factory");
    if (!el) return;
    if (S.fState === "load") {
      el.innerHTML = factoryAbsent("LADE", "factory.json wird gelesen.");
      return;
    }
    if (S.fState === "absent") {
      el.innerHTML = factoryAbsent("KEINE DATEN", "factory.json ist nicht vorhanden. Die übrigen Panels laufen weiter.");
      return;
    }
    if (S.fState === "bad" || !S.F) {
      el.innerHTML = factoryAbsent("UNGÜLTIG", "factory.json ließ sich nicht lesen.");
      return;
    }
    var F = S.F;
    var schema = F.schema == null || F.schema === "" ? "–" : String(F.schema);
    var warn = schema !== "–" && schema !== "desk.factory.v1"
      ? '<div class="alert"><b>SCHEMA</b> ' + esc(schema) + " — erwartet desk.factory.v1. Bekannte Felder werden trotzdem gezeigt.</div>"
      : "";
    var cells = [
      ["Schema", esc(schema), ""],
      ["Mode", F.mode == null || F.mode === "" ? "–" : esc(F.mode), ""],
      ["Specs", fmtInt(F.n_specs), ""],
      ["Scored", fmtInt(F.n_scored), ""],
      ["Pass", fmtInt(F.n_pass), "laut Datei"],
      ["Queue", fmtInt(F.n_queue), ""],
      ["Budget", (numOrNull(F.budget_used) == null && numOrNull(F.budget_total) == null) ? "–" : fmtInt(F.budget_used) + " / " + fmtInt(F.budget_total), "Rest " + fmtInt(F.budget_remaining)],
      ["DSR N", fmtInt(F.dsr_n), ""]
    ];
    var strip = '<div class="strip">' + cells.map(function (c) {
      return '<div class="cell"><div class="l">' + esc(c[0]) + '</div><div class="n">' + c[1] + '</div><div class="s">' + esc(c[2] || "") + "</div></div>";
    }).join("") + "</div>";
    var used = numOrNull(F.budget_used);
    var total = numOrNull(F.budget_total);
    var bar = "";
    if (used != null && total != null && total > 0) {
      var width = Math.max(0, Math.min(100, used / total * 100));
      var hot = used >= total ? " dn" : "";
      bar = '<div class="bar"><span class="' + hot + '" style="width:' + width.toFixed(1) + '%"></span></div>';
    }
    var budget = '<div class="kv">' +
      kv("Tag UTC", esc(F.budget_day_utc || "–")) +
      kv("Verbraucht", fmtInt(F.budget_used)) +
      kv("Budget", fmtInt(F.budget_total)) +
      kv("Rest", fmtInt(F.budget_remaining)) +
      kv("Pipeline", fmtTs(F.pipeline_updated)) +
      kv("Erzeugt", esc(F.generated_label || fmtTs(F.generated))) +
      "</div>" + bar + '<div class="note">' + esc(F.budget_rule || "–") + "</div>";
    var regime = '<div class="kv">' +
      kv("Filter", F.regime_filter == null || F.regime_filter === "" ? "–" : esc(F.regime_filter)) +
      kv("risk_on", yn(F.regime_risk_on)) +
      kv("Longs", yn(F.regime_longs_allowed)) +
      kv("Shorts", yn(F.regime_shorts_allowed)) +
      kv("Tag", esc(F.regime_day || "–")) +
      kv("Stand", fmtTs(F.regime_as_of)) +
      "</div>" + '<div class="note">' + esc(F.regime_note || "–") + "</div>";
    var counts = arr(F.counts);
    var countsHtml = counts.length ? '<table class="t"><thead><tr><th>Status</th><th class="r">N</th></tr></thead><tbody>' +
      counts.map(function (c) {
        if (!c || typeof c !== "object") return "";
        return "<tr><td>" + (c.status == null || c.status === "" ? "–" : esc(c.status)) + '</td><td class="r">' + fmtInt(c.n) + "</td></tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>KEINE DATEN</b>Keine Zählung.</div>';
    var queue = arr(F.queue);
    var queueHtml = queue.length ? '<table class="t cards">' + ths(["Id", "Name", "Family", "Units", "Queued", "Waiting"]) + "<tbody>" +
      queue.map(function (q) {
        if (!q || typeof q !== "object") return "";
        var waiting = q.waiting;
        var wait = waiting == null || waiting === "" ? "–" : (typeof waiting === "number" ? fmtInt(waiting) : esc(waiting));
        return "<tr>" + td("Id", esc(q.id || "–"), "sym") + td("Name", esc(q.name || "–")) +
          td("Family", esc(q.family || "–")) + td("Units", fmtInt(q.units_needed), "r") +
          td("Queued", fmtTs(q.queued_at)) + td("Waiting", wait) + "</tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>QUEUE LEER</b>Keine wartenden Specs.</div>';
    var heads = [
      gateHead("Sharpe", ">", F.gate_sharpe_gt, false),
      gateHead("DSR", ">", F.gate_dsr_gt, false),
      gateHead("PBO", "<", F.gate_pbo_lt, false),
      gateHead("Max DD", "<", F.gate_max_dd_lt, true),
      gateHead("Closes", "≥", F.gate_closes_ge, false)
    ];
    var cand = arr(F.candidates);
    var candHtml = cand.length ? '<table class="t cards">' +
      ths(["Name", "Status", "Verdict"].concat(heads)) + "<tbody>" +
      cand.map(function (c) {
        if (!c || typeof c !== "object") return "";
        var name = esc(c.name || c.id || "–");
        if (c.variant) name += ' <span class="muted">' + esc(c.variant) + "</span>";
        return "<tr>" +
          td("Name", '<span class="sym">' + name + "</span>") +
          td("Status", c.status == null || c.status === "" ? "–" : esc(c.status)) +
          td("Verdict", verdictHtml(c)) +
          td(heads[0], metricHtml(c.sharpe, ">", F.gate_sharpe_gt, signedDec(c.sharpe, 4)), "r") +
          td(heads[1], metricHtml(c.dsr, ">", F.gate_dsr_gt, signedDec(c.dsr, 4)), "r") +
          td(heads[2], metricHtml(c.pbo, "<", F.gate_pbo_lt, signedDec(c.pbo, 4)), "r") +
          td(heads[3], metricHtml(c.max_dd, "<", F.gate_max_dd_lt, fmtPctFrac(c.max_dd)), "r") +
          td(heads[4], metricHtml(c.closes, ">=", F.gate_closes_ge, fmtInt(c.closes)), "r") +
          "</tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>KEINE DATEN</b>Keine Kandidaten.</div>';
    var notes = arr(F.notes).filter(function (n) { return n && n.text != null && String(n.text) !== ""; });
    var notesHtml = notes.length ? notes.map(function (n) { return '<div class="note">' + esc(n.text) + "</div>"; }).join("") : "";
    var diagCol = '<div class="note">diagnostic = true heißt nur Diagnose im offenen Fenster. Null-Kennzahlen haben kein Pass und kein Fail. Fingerprint ' +
      esc(F.fingerprint || "–") + ".</div>";
    el.innerHTML = warn + strip +
      '<div class="grid-fac">' + panel("BU", "BUDGET", budget) + panel("RG", "REGIME", regime) + "</div>" +
      '<div class="grid-fac">' + panel("CT", "COUNTS", countsHtml) + panel("QU", "QUEUE", queueHtml) + "</div>" +
      panel("CA", "CANDIDATES", candHtml + diagCol) +
      (notesHtml ? panel("NT", "NOTES", notesHtml) : "");
  }

  function useBookCurve() {
    return !S.D || hideSummedTotals(S.D.total) || S.series !== "comb";
  }

  function sourceSeries() {
    if (!S.D) return { name: "–", pts: [] };
    if (useBookCurve()) {
      var b = bookById(S.bookId) || bookById("main") || books()[0];
      return { name: b ? (b.name || b.id) : "Buch", pts: seriesPts(b && b.curve) };
    }
    return { name: "Combined", pts: seriesPts(S.D.combined) };
  }

  function rangeWindowMs() {
    if (S.range === "24h") return 864e5;
    if (S.range === "7d") return 7 * 864e5;
    if (S.range === "30d") return 30 * 864e5;
    return Infinity;
  }

  function filterByRange(bars) {
    if (!bars.length || !isFinite(rangeWindowMs())) return bars;
    var end = bars[bars.length - 1].ms;
    var cut = end - rangeWindowMs();
    var out = bars.filter(function (b) { return b.ms >= cut; });
    return out.length ? out : [bars[bars.length - 1]];
  }

  function syncBookPick() {
    var sel = document.getElementById("book-pick");
    if (!sel) return;
    var list = books();
    var ids = list.map(function (b) { return b && b.id; }).join("|");
    if (sel.dataset.ids !== ids) {
      sel.innerHTML = list.map(function (b) {
        if (!b) return "";
        return '<option value="' + esc(b.id) + '">' + esc(b.name || b.id) + "</option>";
      }).join("");
      sel.dataset.ids = ids;
    }
    if (S.bookId) sel.value = S.bookId;
  }

  function axisEquity(v) {
    if (!Number.isFinite(v)) return "–";
    var s = Math.abs(v) >= 1000
      ? Math.round(v).toLocaleString("de-DE")
      : v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s + " €";
  }

  function fmtAxis(s, span) {
    var d = new Date(s);
    if (Number.isNaN(+d)) return "";
    var opts = { timeZone: TZ, day: "2-digit", month: "2-digit" };
    if (span < 3 * 864e5) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
    }
    return d.toLocaleString("de-DE", opts);
  }

  function hideTip() {
    var tip = document.getElementById("chart-tip");
    if (tip) tip.hidden = true;
  }

  function placeTip(host, clientX, clientY, html) {
    var tip = document.getElementById("chart-tip");
    if (!tip || !host) return;
    var rect = host.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = html;
    var x = clientX - rect.left + 14;
    var y = clientY - rect.top + 14;
    var tw = tip.offsetWidth || 140;
    var th = tip.offsetHeight || 44;
    if (x + tw > rect.width - 4) x = clientX - rect.left - tw - 10;
    if (y + th > rect.height - 4) y = clientY - rect.top - th - 10;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }

  function drawChart() {
    var cv = document.getElementById("chart");
    var host = document.getElementById("chart-host");
    var read = document.getElementById("ohlc");
    if (!cv || !host) return;
    var w = host.clientWidth;
    var h = host.clientHeight;
    if (w < 20 || h < 20) return;
    var dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    var bw = Math.round(w * dpr);
    var bh = Math.round(h * dpr);
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    var src = sourceSeries();
    var pctMode = S.mode === "line";
    var pts = src.pts;
    if (pctMode && pts.length && pts[0].v) {
      var base = pts[0].v;
      pts = pts.map(function (p) { return { t: p.t, ms: p.ms, v: (p.v / base - 1) * 100 }; });
    }
    var built = S.mode === "candle" ? stepsToCandles(src.pts) : pts.map(function (p) {
      return { t: p.t, ms: p.ms, o: p.v, h: p.v, l: p.v, c: p.v };
    });
    var ranged = filterByRange(built);
    if (!ranged.length) {
      ctx.fillStyle = "#858585";
      ctx.font = "13px ui-monospace, monospace";
      ctx.fillText("KEINE KURVE", 12, 28);
      if (read) read.textContent = src.name + " · keine Punkte";
      hideTip();
      host.dataset.zoomed = "0";
      return;
    }
    var full0 = ranged[0].ms;
    var full1 = ranged[ranged.length - 1].ms;
    if (full1 <= full0) full1 = full0 + 60e3;
    var t0 = full0;
    var t1 = full1;
    if (S.zoom) {
      t0 = Math.max(full0, S.zoom.t0);
      t1 = Math.min(full1, S.zoom.t1);
      if (!(t1 > t0)) { t0 = full0; t1 = full1; S.zoom = null; }
    }
    var bars = ranged.filter(function (b) { return b.ms >= t0 && b.ms <= t1; });
    if (!bars.length) bars = ranged.slice();
    var pad = { l: 8, r: 86, t: 12, b: 26 };
    var plotW = Math.max(10, w - pad.l - pad.r);
    var plotH = Math.max(10, h - pad.t - pad.b);
    function xOf(ms) {
      if (t1 === t0) return pad.l + plotW / 2;
      return pad.l + (ms - t0) / (t1 - t0) * plotW;
    }
    var min = Infinity;
    var max = -Infinity;
    bars.forEach(function (b) {
      min = Math.min(min, b.l, b.o, b.c);
      max = Math.max(max, b.h, b.o, b.c);
    });
    var ema = null;
    var emaPts = [];
    if (S.mode === "candle") {
      var k = 2 / 9;
      var seen = 0;
      ranged.forEach(function (b) {
        ema = ema == null ? b.c : b.c * k + ema * (1 - k);
        seen++;
        if (seen >= 8 && b.ms >= t0 && b.ms <= t1) {
          emaPts.push({ ms: b.ms, v: ema });
          min = Math.min(min, ema);
          max = Math.max(max, ema);
        }
      });
    }
    if (min === max) {
      var bump = Math.abs(min) * 0.01 || 1;
      min -= bump;
      max += bump;
    } else {
      var spanY = max - min;
      min -= spanY * 0.08;
      max += spanY * 0.08;
    }
    function yOf(v) {
      return pad.t + (max - v) / (max - min) * plotH;
    }
    S.chart = {
      bars: bars, ranged: ranged, pct: pctMode, name: src.name,
      t0: t0, t1: t1, full0: full0, full1: full1,
      pad: pad, plotW: plotW, plotH: plotH, yMin: min, yMax: max
    };
    host.dataset.zoomed = S.zoom ? "1" : "0";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#c8c8c8";
    ctx.textAlign = "right";
    for (var g = 0; g <= 4; g++) {
      var val = min + (max - min) * (g / 4);
      var y = yOf(val);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r + 4, y);
      ctx.stroke();
      var label = pctMode ? ((val > 0 ? "+" : "") + val.toFixed(1).replace(".", ",") + " %") : axisEquity(val);
      ctx.fillText(label, w - 6, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#c8c8c8";
    var span = t1 - t0;
    var lastLabel = -999;
    bars.forEach(function (b, i) {
      var x = xOf(b.ms);
      var text = fmtAxis(b.t, span);
      var tw = ctx.measureText(text).width;
      if (x - tw / 2 < 2 || x + tw / 2 > w - 2) return;
      if (x - lastLabel < Math.max(64, tw + 10) && i !== bars.length - 1) return;
      lastLabel = x;
      ctx.fillText(text, x, h - 6);
    });
    if (S.mode === "candle") {
      var gaps = [];
      for (var i = 1; i < bars.length; i++) gaps.push(Math.abs(xOf(bars[i].ms) - xOf(bars[i - 1].ms)));
      gaps.sort(function (a, b) { return a - b; });
      var med = gaps.length ? gaps[gaps.length >> 1] : 10;
      var cw = Math.max(3, Math.min(22, med * 0.62));
      bars.forEach(function (b) {
        var up = b.c >= b.o;
        ctx.strokeStyle = up ? "#3ad08a" : "#ff5c5c";
        ctx.fillStyle = ctx.strokeStyle;
        var x = xOf(b.ms);
        if (x < pad.l - 2 || x > w - pad.r + 2) return;
        ctx.beginPath();
        ctx.moveTo(x, yOf(b.h));
        ctx.lineTo(x, yOf(b.l));
        ctx.stroke();
        var y1 = yOf(Math.max(b.o, b.c));
        var y2 = yOf(Math.min(b.o, b.c));
        ctx.fillRect(x - cw / 2, y1, cw, Math.max(1, y2 - y1));
      });
      if (emaPts.length) {
        ctx.strokeStyle = "#ffa028";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        emaPts.forEach(function (p, i) {
          var x = xOf(p.ms);
          var y = yOf(p.v);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#ffa028";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      bars.forEach(function (b, i) {
        var x = xOf(b.ms);
        var y = yOf(b.c);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    var hi = S.hover;
    var hb = hi != null && bars[hi] ? bars[hi] : null;
    if (hb) {
      var hx = xOf(hb.ms);
      var hy = yOf(hb.c);
      ctx.strokeStyle = "#8a8a8a";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.t);
      ctx.lineTo(hx, pad.t + plotH);
      ctx.moveTo(pad.l, hy);
      ctx.lineTo(w - pad.r, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (read) {
      var show = hb || bars[bars.length - 1];
      var valTxt = pctMode
        ? ((show.c > 0 ? "+" : "") + show.c.toFixed(2).replace(".", ",") + " %")
        : axisEquity(show.c);
      read.innerHTML = "<b>" + esc(src.name) + "</b> " + esc(valTxt) + ' <span class="muted">' + esc(fmtTs(show.t)) + "</span>";
    }
    if (hb && S.tipPos) {
      var tipVal = pctMode
        ? ((hb.c > 0 ? "+" : "") + hb.c.toFixed(2).replace(".", ",") + " %")
        : axisEquity(hb.c);
      placeTip(host, S.tipPos.x, S.tipPos.y, "<b>" + esc(fmtTs(hb.t)) + "</b><br>" + esc(src.name) + " " + esc(tipVal));
    } else hideTip();
  }

  function nearestBar(clientX) {
    var c = S.chart;
    var host = document.getElementById("chart-host");
    if (!c || !c.bars || !c.bars.length || !host) return null;
    var rect = host.getBoundingClientRect();
    var x = clientX - rect.left;
    var ratio = c.plotW ? (x - c.pad.l) / c.plotW : 0;
    ratio = Math.max(0, Math.min(1, ratio));
    var target = c.t0 + ratio * (c.t1 - c.t0);
    var best = 0;
    var bestD = Infinity;
    for (var i = 0; i < c.bars.length; i++) {
      var d = Math.abs(c.bars[i].ms - target);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function applyZoom(t0, t1) {
    var c = S.chart;
    if (!c) return;
    var span = t1 - t0;
    var full = c.full1 - c.full0;
    if (span >= full - 1000) { S.zoom = null; drawChart(); return; }
    if (t0 < c.full0) { t1 += c.full0 - t0; t0 = c.full0; }
    if (t1 > c.full1) { t0 -= t1 - c.full1; t1 = c.full1; }
    t0 = Math.max(c.full0, t0);
    t1 = Math.min(c.full1, t1);
    if (t1 - t0 < 60e3) return;
    S.zoom = { t0: t0, t1: t1 };
    drawChart();
  }

  function zoomAt(clientX, factor) {
    var c = S.chart;
    var host = document.getElementById("chart-host");
    if (!c || !host) return;
    var rect = host.getBoundingClientRect();
    var ratio = c.plotW ? ((clientX - rect.left) - c.pad.l) / c.plotW : 0.5;
    ratio = Math.max(0, Math.min(1, ratio));
    var span = (c.t1 - c.t0) * factor;
    var focus = c.t0 + ratio * (c.t1 - c.t0);
    applyZoom(focus - ratio * span, focus - ratio * span + span);
  }

  var chartPointers = {};
  var chartDrag = null;
  var chartPinch = null;

  function onChartPointerDown(ev) {
    var host = ev.currentTarget;
    if (host.setPointerCapture) { try { host.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
    chartPointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    var ids = Object.keys(chartPointers);
    if (ids.length === 1 && S.chart) {
      chartDrag = { x: ev.clientX, y: ev.clientY, t0: S.chart.t0, t1: S.chart.t1, moved: false };
      chartPinch = null;
    } else if (ids.length === 2 && S.chart) {
      var a = chartPointers[ids[0]], b = chartPointers[ids[1]];
      chartPinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, t0: S.chart.t0, t1: S.chart.t1, mid: (a.x + b.x) / 2 };
      chartDrag = null;
    }
  }

  function onChartPointerMove(ev) {
    if (chartPointers[ev.pointerId]) chartPointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    var ids = Object.keys(chartPointers);
    if (ids.length >= 2 && chartPinch && S.chart) {
      var a = chartPointers[ids[0]], b = chartPointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      var factor = chartPinch.dist / dist;
      var span = (chartPinch.t1 - chartPinch.t0) * factor;
      var host = ev.currentTarget;
      var rect = host.getBoundingClientRect();
      var ratio = S.chart.plotW ? (chartPinch.mid - rect.left - S.chart.pad.l) / S.chart.plotW : 0.5;
      ratio = Math.max(0, Math.min(1, ratio));
      var focus = chartPinch.t0 + ratio * (chartPinch.t1 - chartPinch.t0);
      applyZoom(focus - ratio * span, focus + (1 - ratio) * span);
      return;
    }
    if (chartDrag && ids.length === 1 && S.chart) {
      var dx = ev.clientX - chartDrag.x;
      if (Math.abs(dx) > 3 || Math.abs(ev.clientY - chartDrag.y) > 3) chartDrag.moved = true;
      if (chartDrag.moved && S.chart.plotW) {
        var shift = -dx / S.chart.plotW * (chartDrag.t1 - chartDrag.t0);
        applyZoom(chartDrag.t0 + shift, chartDrag.t1 + shift);
      }
    }
    S.tipPos = { x: ev.clientX, y: ev.clientY };
    var best = nearestBar(ev.clientX);
    if (best == null) return;
    if (S.hover !== best) S.hover = best;
    drawChart();
  }

  function onChartPointerUp(ev) {
    delete chartPointers[ev.pointerId];
    if (Object.keys(chartPointers).length < 2) chartPinch = null;
    if (!Object.keys(chartPointers).length) chartDrag = null;
  }

  function onChartLeave() {
    if (chartDrag && chartDrag.moved) return;
    S.hover = null;
    S.tipPos = null;
    hideTip();
    drawChart();
  }

  function onChartWheel(ev) {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.deltaY > 0 ? 1.2 : 1 / 1.2);
  }

  function markSeg() {
    var nodes = document.querySelectorAll("[data-set]");
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      b.classList.toggle("on", S[b.dataset.set] === b.dataset.val);
    }
  }

  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = "desk";
    S.view = v;
    var views = document.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) views[i].classList.toggle("on", views[i].id === "view-" + v);
    var keys = document.querySelectorAll(".fkeys button");
    for (var j = 0; j < keys.length; j++) keys[j].classList.toggle("on", keys[j].dataset.view === v);
    if (location.hash !== "#" + v) {
      try { history.replaceState(null, "", "#" + v); } catch (e) { /* file URL */ }
    }
    markSeg();
    requestAnimationFrame(drawChart);
  }

  function flash(text) {
    var el = document.getElementById("hint");
    S.hint = text;
    if (el) {
      el.hidden = !text;
      el.innerHTML = text ? "<b>CMD</b> " + esc(text) : "";
    }
  }

  function onCmd(raw) {
    var u = String(raw || "").trim().toUpperCase();
    if (!u) return;
    var views = {
      DESK: "desk", F1: "desk", MON: "desk",
      BOOKS: "books", BOOK: "books", F2: "books",
      FACTORY: "factory", FABRIK: "factory", F3: "factory",
      HEALTH: "health", F4: "health",
      LOG: "log", F5: "log"
    };
    if (views[u]) { setView(views[u]); flash(""); return; }
    if (u === "HELP" || u === "?") {
      flash("F1 DESK · F2 BOOKS · F3 FACTORY · F4 HEALTH · F5 LOG · Buch-Id. PAPER, nur Anzeige.");
      return;
    }
    if (u === "BUY" || u === "SELL" || u === "KILL" || u === "ORDER" || u === "AUTO-TRADE" || u === "TRADE") {
      flash("PAPER. Nur Anzeige, keine Orders.");
      return;
    }
    var found = null;
    books().forEach(function (b) {
      if (!b) return;
      if (String(b.id || "").toUpperCase() === u || String(b.name || "").toUpperCase() === u) found = b;
    });
    if (found) {
      S.bookId = found.id;
      S.series = "book";
      S.zoom = null;
      setView("desk");
      render();
      flash(found.id);
      return;
    }
    flash("Unbekannt. HELP zeigt die Befehle.");
  }

  function render() {
    var saved = saveScroll();
    var bk = document.getElementById("bk-count");
    if (bk) bk.textContent = books().length ? String(books().length) : "–";
    var sec = document.getElementById("cmd-sec");
    if (sec) sec.textContent = S.bookId || "PAPER";
    var seg = document.getElementById("seg-series");
    var hideSum = !S.D || hideSummedTotals(S.D.total);
    if (seg) seg.hidden = hideSum;
    if (hideSum) S.series = "book";
    syncBookPick();
    renderStrip();
    renderBooks("books", books());
    renderRegime();
    renderPos();
    renderHeat();
    renderHealthCompact();
    renderLogCompact();
    renderBooksView();
    renderFactory();
    renderHealthView();
    renderLogView();
    markSeg();
    updateStatus();
    restoreScroll(saved);
    drawChart();
    var ready = document.documentElement;
    ready.dataset.ready = S.D ? "1" : "0";
    ready.dataset.factory = S.fState;
    ready.dataset.screen = S.view;
  }

  function updateStatus() {
    var el = document.getElementById("status");
    if (!el) return;
    var dot = S.dataErr ? "bad" : (S.D ? "ok" : "warn");
    var label = S.dataErr ? "POLL" : (S.D ? "LIVE" : "LADE");
    var gen = S.D ? (S.D.generated_label || fmtTs(S.D.generated)) : "–";
    var age = "–";
    if (S.D && S.D.generated) {
      var ms = +new Date(S.D.generated);
      if (Number.isFinite(ms)) age = fmtAge((Date.now() - ms) / 60000);
    }
    var fac = S.fState === "ok" ? "DATEN" : S.fState === "bad" ? "UNGÜLTIG" : S.fState === "load" ? "LADE" : "KEINE DATEN";
    var mode = S.D && S.D.mode ? String(S.D.mode).toUpperCase() : "PAPER";
    el.innerHTML =
      '<span><span class="dot ' + dot + '"></span>DATA <b>' + label + "</b></span>" +
      "<span>STAND <b>" + esc(gen) + "</b></span>" +
      '<span class="st-wide">ALTER <b>' + esc(age) + "</b></span>" +
      "<span>MODE <b>" + esc(mode) + "</b></span>" +
      "<span>FACTORY <b>" + fac + "</b></span>" +
      '<span class="st-wide">PAPER · NUR ANZEIGE</span>' +
      '<span style="margin-left:auto">ROM <b id="rom-clock">–</b></span>';
    tickClock();
  }

  function tickClock() {
    var node = document.getElementById("rom-clock");
    if (!node) return;
    node.textContent = new Date().toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var clocks = document.querySelectorAll(".clock .t");
    for (var i = 0; i < clocks.length; i++) {
      var fmt = S.clockFmt && S.clockFmt[i];
      if (fmt) clocks[i].textContent = fmt.format(Date.now());
    }
  }

  function buildClocks() {
    var cities = [
      ["Rom", "Europe/Rome"], ["New York", "America/New_York"], ["London", "Europe/London"],
      ["Dubai", "Asia/Dubai"], ["Singapore", "Asia/Singapore"], ["Hong Kong", "Asia/Hong_Kong"],
      ["Tokyo", "Asia/Tokyo"], ["Sydney", "Australia/Sydney"], ["UTC", "UTC"]
    ];
    var local = "";
    try { local = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { local = ""; }
    S.clockFmt = cities.map(function (c) {
      return new Intl.DateTimeFormat("en-GB", { timeZone: c[1], hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    });
    var host = document.getElementById("clocks");
    if (!host) return;
    host.innerHTML = cities.map(function (c, i) {
      var here = c[1] === local ? " local" : "";
      return '<div class="clock' + here + '"><div class="t">–</div><div class="c">' + esc(c[0]) +
        (here ? '<span class="mk">LOCAL</span>' : "") + "</div></div>";
    }).join("");
    tickClock();
  }

  var pollTimer = 0;
  var armedFor = 0;
  function armPoll() {
    if (location.protocol === "file:") return;
    var ms = ((S.D && numOrNull(S.D.refresh_s)) || 300) * 1000;
    if (pollTimer && armedFor === ms) return;
    if (pollTimer) clearInterval(pollTimer);
    armedFor = ms;
    pollTimer = setInterval(function () { check(); }, ms);
  }

  async function loadData() {
    var r = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("data " + r.status);
    var j = await r.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("data shape");
    S.D = j;
    S.dataErr = false;
    S.lastCheck = new Date();
    if (!S.bookId) {
      var list = arr(j.books);
      var main = null;
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === "main") main = list[i];
      var pick = main || list[0];
      if (pick) S.bookId = pick.id;
    }
  }

  async function loadFactory() {
    try {
      var r = await fetch("factory.json?t=" + Date.now(), { cache: "no-store" });
      if (r.status === 404 || r.status === 204) {
        S.F = null;
        S.fState = "absent";
        return;
      }
      if (!r.ok) {
        if (!S.F) S.fState = "absent";
        return;
      }
      var text = await r.text();
      if (!String(text).trim()) {
        S.F = null;
        S.fState = "absent";
        return;
      }
      var j;
      try { j = JSON.parse(text); }
      catch (err) {
        S.F = null;
        S.fState = "bad";
        return;
      }
      if (!j || typeof j !== "object" || Array.isArray(j)) {
        S.F = null;
        S.fState = "bad";
        return;
      }
      S.F = j;
      S.fState = "ok";
    } catch (err) {
      if (!S.F) S.fState = "absent";
    }
  }

  async function check() {
    if (S.busy) return;
    S.busy = true;
    try {
      try { await loadData(); }
      catch (err) {
        S.dataErr = true;
        S.lastCheck = new Date();
      }
      await loadFactory();
      render();
      armPoll();
    } catch (err) {
      var n = document.getElementById("booterr");
      if (n) {
        n.hidden = false;
        n.textContent = "FEHLER " + (err && err.message ? err.message : err);
      }
    } finally {
      S.busy = false;
    }
  }

  function boot() {
    window.addEventListener("error", function (ev) {
      var n = document.getElementById("booterr");
      if (!n) return;
      n.hidden = false;
      n.textContent = "FEHLER " + (ev.message || "");
    });
    window.addEventListener("unhandledrejection", function (ev) {
      var n = document.getElementById("booterr");
      if (n) {
        n.hidden = false;
        n.textContent = "FEHLER " + ((ev.reason && ev.reason.message) || ev.reason || "");
      }
      if (ev.preventDefault) ev.preventDefault();
    });
    buildClocks();
    var hash = (location.hash || "").replace("#", "");
    if (VIEWS.indexOf(hash) >= 0) S.view = hash;
    setView(S.view);
    document.addEventListener("click", function (ev) {
      var viewBtn = ev.target.closest && ev.target.closest("[data-view]");
      if (viewBtn && viewBtn.dataset.view) { setView(viewBtn.dataset.view); return; }
      var seg = ev.target.closest && ev.target.closest("[data-set]");
      if (seg && seg.dataset.set) {
        S[seg.dataset.set] = seg.dataset.val;
        if (seg.dataset.set === "range" || seg.dataset.set === "series" || seg.dataset.set === "mode") S.zoom = null;
        S.hover = null;
        S.tipPos = null;
        markSeg();
        drawChart();
        return;
      }
      var book = ev.target.closest && ev.target.closest("[data-book]");
      if (book && book.dataset.book) {
        S.bookId = book.dataset.book;
        S.series = "book";
        S.zoom = null;
        S.hover = null;
        S.tipPos = null;
        render();
      }
    });
    var form = document.getElementById("cmd-form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = document.getElementById("cmd");
      var value = input ? input.value : "";
      if (input) input.value = "";
      onCmd(value);
    });
    document.addEventListener("keydown", function (ev) {
      var tag = document.activeElement && document.activeElement.tagName;
      var map = { F1: "desk", F2: "books", F3: "factory", F4: "health", F5: "log" };
      if (map[ev.key]) { ev.preventDefault(); setView(map[ev.key]); return; }
      if ((ev.key === "/" || ev.key === "`") && tag !== "INPUT" && tag !== "TEXTAREA") {
        ev.preventDefault();
        var input = document.getElementById("cmd");
        if (input) input.focus();
      }
    });
    var host = document.getElementById("chart-host");
    if (host) {
      host.addEventListener("pointerdown", onChartPointerDown);
      host.addEventListener("pointermove", onChartPointerMove);
      host.addEventListener("pointerup", onChartPointerUp);
      host.addEventListener("pointercancel", onChartPointerUp);
      host.addEventListener("pointerleave", onChartLeave);
      host.addEventListener("wheel", onChartWheel, { passive: false });
      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () { drawChart(); });
        ro.observe(host);
      }
    }
    var reset = document.getElementById("zoom-reset");
    if (reset) reset.addEventListener("click", function () { S.zoom = null; S.hover = null; drawChart(); });
    var pick = document.getElementById("book-pick");
    if (pick) pick.addEventListener("change", function () {
      S.bookId = pick.value;
      S.series = "book";
      S.zoom = null;
      S.hover = null;
      S.tipPos = null;
      render();
    });
    window.addEventListener("resize", function () {
      clearTimeout(S.rz);
      S.rz = setTimeout(drawChart, 80);
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && (!S.lastCheck || Date.now() - S.lastCheck > 60000)) check();
    });
    setInterval(tickClock, 1000);
    try { render(); }
    catch (err) {
      var n = document.getElementById("booterr");
      if (n) { n.hidden = false; n.textContent = "FEHLER " + (err && err.message ? err.message : err); }
    }
    check();
    setTimeout(function () { check(); }, 1500);
  }

  return { boot: boot, gateState: gateState, stepsToCandles: stepsToCandles, selftest: selftest, numOrNull: numOrNull, isLiveAlarm: isLiveAlarm, hideSummedTotals: hideSummedTotals, countOpens: countOpens };
});
