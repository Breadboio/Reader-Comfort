/* Reader Comfort — sticky notes
 * Draggable, resizable text notes pinned to a page. Stored per-URL in
 * document coordinates (same drift caveat as the draw layer — see README).
 */
(function () {
  "use strict";

  var KEY = "note:" + location.origin + location.pathname + location.search;
  var PREFS_KEY = "notePrefs";

  var COLORS = {
    yellow: { bg: "#fff4b8", bar: "#f4e08a", ink: "#3a3410" },
    pink:   { bg: "#ffd9e8", bar: "#f4b7cf", ink: "#3a1020" },
    blue:   { bg: "#d6e8ff", bar: "#b3d1f7", ink: "#0e2540" },
    green:  { bg: "#d6f5df", bar: "#b0e6c2", ink: "#0f3320" }
  };

  var prefs = { color: "yellow" };
  var notes = [];              // [{id,x,y,w,h,text,color,collapsed}]
  var root = null, styleEl = null;
  var drag = null, topZ = 10;
  var saveT = null;

  /* ---------- styling ---------- */

  function injectStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.id = "rc-note-style";
    var colorRules = Object.keys(COLORS).map(function (c) {
      var v = COLORS[c];
      return ".rc-note[data-c='" + c + "']{background:" + v.bg + ";color:" + v.ink + "}" +
        ".rc-note[data-c='" + c + "'] .rc-note-bar{background:" + v.bar + "}" +
        ".rc-note[data-c='" + c + "'] .rc-note-body{color:" + v.ink + "}";
    }).join("");
    styleEl.textContent =
      "#rc-notes-root{position:absolute;top:0;left:0;width:0;height:0;z-index:2147483645}" +
      ".rc-note{position:absolute;min-width:150px;min-height:70px;border-radius:6px;" +
        "box-shadow:0 6px 22px rgba(0,0,0,.28);overflow:hidden;resize:both;" +
        "font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column}" +
      ".rc-note[data-collapsed='true']{height:auto!important;min-height:0;resize:none}" +
      ".rc-note[data-collapsed='true'] .rc-note-body{display:none}" +
      ".rc-note-bar{flex:0 0 auto;height:22px;display:flex;align-items:center;gap:4px;" +
        "padding:0 4px;cursor:move;user-select:none}" +
      ".rc-note-bar button{margin:0;width:18px;height:16px;padding:0;border:0;border-radius:3px;" +
        "background:rgba(0,0,0,.08);cursor:pointer;font:11px/1 system-ui,sans-serif;color:inherit}" +
      ".rc-note-bar .rc-note-spacer{flex:1}" +
      ".rc-note-dot{width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,.25);" +
        "cursor:pointer;flex:0 0 auto}" +
      ".rc-note-body{flex:1 1 auto;border:0;outline:0;background:transparent;resize:none;" +
        "padding:6px 8px;font:inherit;width:100%}" +
      colorRules;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ---------- root ---------- */

  function ensureRoot() {
    root = document.getElementById("rc-notes-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "rc-notes-root";
      (document.body || document.documentElement).appendChild(root);
    }
  }

  /* ---------- note element ---------- */

  function build(rec) {
    var el = document.createElement("div");
    el.className = "rc-note";
    el.dataset.id = rec.id;
    el.dataset.c = rec.color || "yellow";
    if (rec.collapsed) el.dataset.collapsed = "true";
    el.style.left = rec.x + "px";
    el.style.top = rec.y + "px";
    el.style.width = (rec.w || 220) + "px";
    el.style.height = (rec.h || 150) + "px";
    el.style.zIndex = ++topZ;

    var bar = document.createElement("div");
    bar.className = "rc-note-bar";
    var dot = document.createElement("span");
    dot.className = "rc-note-dot";
    dot.style.background = COLORS[rec.color || "yellow"].bar;
    dot.title = "Change colour";
    var spacer = document.createElement("span");
    spacer.className = "rc-note-spacer";
    var collapse = document.createElement("button");
    collapse.textContent = rec.collapsed ? "▸" : "▾";
    collapse.title = "Collapse";
    var del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Delete note";
    bar.append(dot, spacer, collapse, del);

    var body = document.createElement("textarea");
    body.className = "rc-note-body";
    body.placeholder = "Note…";
    body.value = rec.text || "";
    body.spellcheck = false;

    el.append(bar, body);
    root.appendChild(el);

    // bring to front on any interaction
    el.addEventListener("pointerdown", function () { el.style.zIndex = ++topZ; }, true);

    // drag
    bar.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button") || e.target === dot) return;
      drag = { el: el, sx: e.clientX, sy: e.clientY, ox: el.offsetLeft, oy: el.offsetTop };
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    // edit
    body.addEventListener("input", function () {
      rec.text = body.value;
      scheduleSave();
    });

    // colour cycle
    dot.addEventListener("click", function () {
      var keys = Object.keys(COLORS);
      var next = keys[(keys.indexOf(el.dataset.c) + 1) % keys.length];
      el.dataset.c = next;
      rec.color = next;
      dot.style.background = COLORS[next].bar;
      persist();
    });

    // collapse
    collapse.addEventListener("click", function () {
      var c = el.dataset.collapsed === "true";
      if (c) { el.removeAttribute("data-collapsed"); collapse.textContent = "▾"; }
      else { el.dataset.collapsed = "true"; collapse.textContent = "▸"; }
      rec.collapsed = !c;
      persist();
    });

    // delete
    del.addEventListener("click", function () { removeNote(rec.id); });

    // resize
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(debounce(function () {
        if (el.dataset.collapsed === "true") return;
        rec.w = Math.round(el.offsetWidth);
        rec.h = Math.round(el.offsetHeight);
        scheduleSave();
      }, 250));
      ro.observe(el);
    }

    return el;
  }

  /* ---------- drag handlers ---------- */

  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    drag.el.style.left = (drag.ox + e.clientX - drag.sx) + "px";
    drag.el.style.top = (drag.oy + e.clientY - drag.sy) + "px";
  }, true);

  document.addEventListener("pointerup", function () {
    if (!drag) return;
    var el = drag.el, rec = find(el.dataset.id);
    if (rec) { rec.x = Math.round(el.offsetLeft); rec.y = Math.round(el.offsetTop); persist(); }
    drag = null;
  }, true);

  /* ---------- ops ---------- */

  function addNote() {
    var rec = {
      id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      x: Math.round(window.scrollX + window.innerWidth / 2 - 110),
      y: Math.round(window.scrollY + 72),
      w: 220, h: 150, text: "", color: prefs.color, collapsed: false
    };
    notes.push(rec);
    var el = build(rec);
    persist();
    var ta = el.querySelector(".rc-note-body");
    if (ta) ta.focus();
    return notes.length;
  }

  function removeNote(id) {
    var el = root.querySelector('.rc-note[data-id="' + id + '"]');
    if (el) el.remove();
    notes = notes.filter(function (n) { return n.id !== id; });
    persist();
  }

  function clearPage() {
    notes.slice().forEach(function (n) { removeNote(n.id); });
    notes = [];
    try { chrome.storage.local.remove(KEY); } catch (e) {}
  }

  function find(id) { return notes.find(function (n) { return n.id === id; }); }

  /* ---------- storage ---------- */

  function persist() {
    var obj = {}; obj[KEY] = notes;
    try { chrome.storage.local.set(obj); } catch (e) {}
  }
  function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(persist, 500); }
  function savePrefs() {
    var o = {}; o[PREFS_KEY] = { color: prefs.color };
    try { chrome.storage.local.set(o); } catch (e) {}
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function load() {
    chrome.storage.local.get([KEY, PREFS_KEY], function (store) {
      store = store || {};
      if (store[PREFS_KEY]) prefs = Object.assign(prefs, store[PREFS_KEY]);
      notes = Array.isArray(store[KEY]) ? store[KEY] : [];
      injectStyle();
      ensureRoot();
      notes.forEach(build);
    });
  }

  /* ---------- messaging ---------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "rc:notesGetState") {
      sendResponse({ count: notes.length, color: prefs.color, colors: COLORS });
      return true;
    }
    if (msg.type === "rc:notesAdd") {
      var c = addNote();
      sendResponse({ count: c });
      return true;
    }
    if (msg.type === "rc:notesSet") {
      if (typeof msg.color === "string") { prefs.color = msg.color; savePrefs(); }
    }
    if (msg.type === "rc:notesClearPage") { clearPage(); }
    if (msg.type === "rc:command" && msg.command === "add-note") { addNote(); }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[PREFS_KEY] && changes[PREFS_KEY].newValue) {
      prefs = Object.assign(prefs, changes[PREFS_KEY].newValue);
    }
  });

  /* ---------- boot ---------- */

  if (document.body) load();
  else document.addEventListener("DOMContentLoaded", load);
})();
