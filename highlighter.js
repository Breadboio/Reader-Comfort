/* Reader Comfort — highlighter
 * Select text -> pick a colour -> it is wrapped in <mark> and remembered
 * for this URL (chrome.storage.local). Highlights are re-anchored on reload
 * by matching the quoted text plus a short prefix/suffix of context.
 */
(function () {
  "use strict";

  var KEY = "hl:" + location.origin + location.pathname + location.search;
  var PREFS_KEY = "hlPrefs";
  var CTX = 40;             // chars of context stored on each side
  var MAX_LEN = 8000;       // don't try to anchor absurdly long selections

  var COLORS = {
    yellow: "rgba(255,214,0,.42)",
    green:  "rgba(120,224,143,.45)",
    pink:   "rgba(255,140,197,.45)",
    blue:   "rgba(130,177,255,.45)"
  };

  var prefs = { color: "yellow", quick: false };
  var highlights = [];         // [{id, exact, prefix, suffix, color}]
  var restored = {};           // id -> true once wrapped into the DOM
  var pendingRange = null;
  var bar = null, styleEl = null;
  var observer = null, stopObserverAt = 0;

  /* ---------- styling ---------- */

  function injectStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.id = "rc-hl-style";
    var marks = Object.keys(COLORS).map(function (c) {
      return "mark.rc-hl[data-c='" + c + "']{background-color:" + COLORS[c] + " !important}";
    }).join("");
    styleEl.textContent =
      "mark.rc-hl{color:inherit !important;background:transparent;border-radius:2px;" +
        "padding:.02em 0;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer}" +
      marks +
      "#rc-hl-bar{position:absolute;z-index:2147483647;display:flex;gap:5px;align-items:center;" +
        "padding:5px 6px;background:#fff;border:1px solid rgba(0,0,0,.18);border-radius:9px;" +
        "box-shadow:0 6px 20px rgba(0,0,0,.24);font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif}" +
      "#rc-hl-bar button{margin:0;padding:0;width:19px;height:19px;border-radius:50%;" +
        "border:2px solid rgba(0,0,0,.18);cursor:pointer;background:#ccc}" +
      "#rc-hl-bar button[data-c='yellow']{background:" + COLORS.yellow + "}" +
      "#rc-hl-bar button[data-c='green']{background:" + COLORS.green + "}" +
      "#rc-hl-bar button[data-c='pink']{background:" + COLORS.pink + "}" +
      "#rc-hl-bar button[data-c='blue']{background:" + COLORS.blue + "}" +
      "#rc-hl-bar button[aria-pressed='true']{outline:2px solid #333;outline-offset:1px}" +
      "#rc-hl-bar .rc-hl-act{width:auto;height:auto;border-radius:6px;padding:3px 8px;" +
        "border:1px solid rgba(0,0,0,.18);background:#f1f1f1;color:#222;font-weight:600}";
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ---------- DOM text scanning ---------- */

  function scan() {
    var walker = document.createTreeWalker(document.body || document.documentElement,
      NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          var t = p.nodeName;
          if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" || t === "TEXTAREA")
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    var nodes = [], offsets = [], parts = [], len = 0, n;
    while ((n = walker.nextNode())) {
      nodes.push(n); offsets.push(len); parts.push(n.data); len += n.data.length;
    }
    return { nodes: nodes, offsets: offsets, full: parts.join("") };
  }

  function locate(s, globalOffset) {
    var lo = 0, hi = s.offsets.length - 1, mid;
    while (lo < hi) {
      mid = (lo + hi + 1) >> 1;
      if (s.offsets[mid] <= globalOffset) lo = mid; else hi = mid - 1;
    }
    return { node: s.nodes[lo], offset: globalOffset - s.offsets[lo] };
  }

  /* ---------- anchoring ---------- */

  function makeAnchor(range) {
    var exact = range.toString();
    if (!exact.trim() || exact.length > MAX_LEN) return null;
    var body = document.body;
    var pre = "", suf = "";
    try {
      var r1 = document.createRange();
      r1.setStart(body, 0);
      r1.setEnd(range.startContainer, range.startOffset);
      pre = r1.toString().slice(-CTX);
    } catch (e) {}
    try {
      var r2 = document.createRange();
      r2.setStart(range.endContainer, range.endOffset);
      r2.setEnd(body, body.childNodes.length);
      suf = r2.toString().slice(0, CTX);
    } catch (e) {}
    return { exact: exact, prefix: pre, suffix: suf };
  }

  function findOffset(full, rec) {
    var from = 0, best = -1, bestScore = -1, i;
    while ((i = full.indexOf(rec.exact, from)) !== -1) {
      var before = full.slice(Math.max(0, i - rec.prefix.length), i);
      var after = full.slice(i + rec.exact.length, i + rec.exact.length + rec.suffix.length);
      var score = commonSuffix(before, rec.prefix) + commonPrefix(after, rec.suffix);
      if (score > bestScore) { bestScore = score; best = i; }
      from = i + 1;
      if (bestScore === rec.prefix.length + rec.suffix.length) break;
    }
    return best;
  }
  function commonPrefix(a, b) { var i = 0, m = Math.min(a.length, b.length); while (i < m && a[i] === b[i]) i++; return i; }
  function commonSuffix(a, b) { var i = 0, m = Math.min(a.length, b.length); while (i < m && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; }

  /* ---------- wrapping / unwrapping ---------- */

  function wrapRange(range, color, id) {
    var root = range.commonAncestorContainer;
    var list = [];
    if (root.nodeType === 3) {
      list = [root];
    } else {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = w.nextNode())) {
        if (n.data && range.intersectsNode(n)) list.push(n);
      }
    }
    list.forEach(function (node) {
      var startOff = node === range.startContainer ? range.startOffset : 0;
      var endOff = node === range.endContainer ? range.endOffset : node.data.length;
      if (endOff <= startOff) return;
      var t = node;
      if (startOff > 0) { t = t.splitText(startOff); endOff -= startOff; }
      if (endOff < t.data.length) t.splitText(endOff);
      if (!t.data.trim()) return;
      var p = t.parentNode;
      if (!p || (p.classList && p.classList.contains("rc-hl"))) return;
      var m = document.createElement("mark");
      m.className = "rc-hl";
      m.dataset.c = color;
      m.dataset.id = id;
      p.insertBefore(m, t);
      m.appendChild(t);
    });
  }

  function wrapByRecord(rec) {
    var s = scan();
    var at = findOffset(s.full, rec);
    if (at < 0) return false;
    try {
      var start = locate(s, at);
      var end = locate(s, at + rec.exact.length);
      var range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      wrapRange(range, rec.color, rec.id);
      return true;
    } catch (e) { return false; }
  }

  function unwrap(id) {
    var marks = document.querySelectorAll('mark.rc-hl[data-id="' + id + '"]');
    Array.prototype.forEach.call(marks, function (m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function recolor(id, color) {
    Array.prototype.forEach.call(
      document.querySelectorAll('mark.rc-hl[data-id="' + id + '"]'),
      function (m) { m.dataset.c = color; });
    var rec = highlights.find(function (h) { return h.id === id; });
    if (rec) { rec.color = color; persist(); }
  }

  /* ---------- storage ---------- */

  function persist() {
    var obj = {};
    obj[KEY] = highlights.map(function (h) {
      return { id: h.id, exact: h.exact, prefix: h.prefix, suffix: h.suffix, color: h.color };
    });
    try { chrome.storage.local.set(obj); } catch (e) {}
  }

  function restoreAll() {
    var any = false;
    highlights.forEach(function (rec) {
      if (restored[rec.id]) return;
      if (wrapByRecord(rec)) { restored[rec.id] = true; any = true; }
    });
    return any;
  }

  function load() {
    chrome.storage.local.get([KEY, PREFS_KEY], function (store) {
      store = store || {};
      if (store[PREFS_KEY]) prefs = Object.assign(prefs, store[PREFS_KEY]);
      highlights = Array.isArray(store[KEY]) ? store[KEY] : [];
      injectStyle();
      restoreAll();
      scheduleRetries();
    });
  }

  function scheduleRetries() {
    var pending = highlights.some(function (h) { return !restored[h.id]; });
    if (!pending) return;
    [400, 1200, 3000, 6000].forEach(function (ms) { setTimeout(restoreAll, ms); });
    // watch for late-rendered content for a little while
    if (!observer) {
      stopObserverAt = Date.now() + 12000;
      observer = new MutationObserver(debounce(function () {
        if (Date.now() > stopObserverAt || !highlights.some(function (h) { return !restored[h.id]; })) {
          observer.disconnect(); observer = null; return;
        }
        restoreAll();
      }, 300));
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ---------- toolbar ---------- */

  function ensureBar() {
    if (bar && bar.isConnected) return bar;
    bar = document.createElement("div");
    bar.id = "rc-hl-bar";
    bar.hidden = true;
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function showBarForSelection(range) {
    var rects = range.getClientRects();
    var r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    buildBar("selection");
    place(r);
  }

  function showBarForMark(mark) {
    ensureBar()._markId = mark.dataset.id;
    buildBar("mark", mark.dataset.c);
    place(mark.getBoundingClientRect());
  }

  function buildBar(mode, activeColor) {
    var b = ensureBar();
    b.innerHTML = "";
    Object.keys(COLORS).forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.c = c;
      btn.title = c;
      btn.setAttribute("aria-pressed", String(c === (activeColor || prefs.color)));
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      btn.addEventListener("click", function () {
        if (mode === "mark") { recolor(b._markId, c); }
        else if (pendingRange) { applyHighlight(pendingRange, c); }
        hideBar();
      });
      b.appendChild(btn);
    });
    var act = document.createElement("button");
    act.type = "button";
    act.className = "rc-hl-act";
    act.textContent = mode === "mark" ? "Remove" : "Copy";
    act.addEventListener("mousedown", function (e) { e.preventDefault(); });
    act.addEventListener("click", function () {
      if (mode === "mark") { removeHighlight(b._markId); }
      else if (pendingRange) {
        try { navigator.clipboard.writeText(pendingRange.toString()); } catch (e) {}
      }
      hideBar();
    });
    b.appendChild(act);
    b.hidden = false;
  }

  function place(rect) {
    var b = bar;
    b.style.visibility = "hidden";
    b.hidden = false;
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var top = window.scrollY + rect.bottom + 6;
    var left = window.scrollX + rect.left;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - bw - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    if (rect.bottom + 6 + bh > document.documentElement.clientHeight && rect.top - bh - 6 > 0) {
      top = window.scrollY + rect.top - bh - 6;
    }
    b.style.top = top + "px";
    b.style.left = left + "px";
    b.style.visibility = "visible";
  }

  function hideBar() {
    if (bar) { bar.hidden = true; bar._markId = null; }
  }

  /* ---------- actions ---------- */

  function applyHighlight(range, color) {
    var anchor = makeAnchor(range);
    if (!anchor) return;
    var id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { wrapRange(range.cloneRange(), color, id); }
    catch (e) { return; }
    var rec = { id: id, exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix, color: color };
    highlights.push(rec);
    restored[id] = true;
    prefs.color = color;
    savePrefs();
    persist();
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  function removeHighlight(id) {
    unwrap(id);
    highlights = highlights.filter(function (h) { return h.id !== id; });
    delete restored[id];
    persist();
  }

  function clearPage() {
    highlights.slice().forEach(function (h) { unwrap(h.id); });
    highlights = [];
    restored = {};
    try { chrome.storage.local.remove(KEY); } catch (e) {}
  }

  function savePrefs() {
    var o = {}; o[PREFS_KEY] = { color: prefs.color, quick: prefs.quick };
    try { chrome.storage.local.set(o); } catch (e) {}
  }

  /* ---------- events ---------- */

  function inEditable(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    while (el) {
      var t = el.nodeName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  document.addEventListener("mouseup", function (e) {
    if (bar && bar.contains(e.target)) return;
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      if (range.collapsed || !range.toString().trim()) return;
      if (inEditable(range.commonAncestorContainer)) return;
      pendingRange = range.cloneRange();
      if (prefs.quick) {
        applyHighlight(pendingRange, prefs.color);
      } else {
        showBarForSelection(range);
      }
    }, 0);
  }, true);

  document.addEventListener("click", function (e) {
    var mark = e.target.closest && e.target.closest("mark.rc-hl");
    var sel = window.getSelection();
    if (mark && (!sel || sel.isCollapsed)) {
      e.stopPropagation();
      showBarForMark(mark);
    }
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (bar && !bar.hidden && !bar.contains(e.target)) hideBar();
  }, true);
  window.addEventListener("scroll", hideBar, true);

  /* ---------- messaging ---------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "rc:hlGetState") {
      sendResponse({
        count: highlights.length,
        restoredCount: Object.keys(restored).length,
        color: prefs.color,
        quick: prefs.quick,
        colors: COLORS
      });
      return true;
    }
    if (msg.type === "rc:hlSet") {
      if (typeof msg.color === "string") prefs.color = msg.color;
      if (typeof msg.quick === "boolean") prefs.quick = msg.quick;
      savePrefs();
    }
    if (msg.type === "rc:hlCopyAll") {
      sendResponse({ text: highlights.map(function (h) { return h.exact; }).join("\n\n") });
      return true;
    }
    if (msg.type === "rc:hlClearPage") {
      clearPage();
    }
    if (msg.type === "rc:command" && msg.command === "toggle-highlight-quick") {
      prefs.quick = !prefs.quick;
      savePrefs();
    }
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
