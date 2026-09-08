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

  var prefs = { color: "yellow", quick: false, enabled: true, dict: false };
  var highlights = [];         // [{id, exact, prefix, suffix, color}]
  var restored = {};           // id -> true once wrapped into the DOM
  var pendingRange = null;
  var bar = null, dictEl = null;
  var dictCache = {};          // word -> parsed entry record (session only)
  var observer = null, stopObserverAt = 0;
  var DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

  /* styling lives in reader.css (manifest-injected, CSP-proof) */

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
      applyEnabled();
      restoreAll();
      scheduleRetries();
    });
  }

  function scheduleRetries() {
    var pending = highlights.some(function (h) { return !restored[h.id]; });
    if (!pending) return;
    [400, 1200, 3000, 6000].forEach(function (ms) { setTimeout(restoreAll, ms); });
    // watch for late-rendered content for a little while
    stopObserverAt = Date.now() + 12000;   // new content extends the window
    if (!observer) {
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

  /* ---------- DOM helpers ---------- */

  /* Icons and popup contents are built as DOM nodes rather than assigned as
   * HTML strings. The markup is static and the dictionary text is remote but
   * inserted as text nodes, so nothing here can inject markup — and it keeps
   * AMO's UNSAFE_VAR_ASSIGNMENT review warning off the submission. */
  var SVG_NS = "http://www.w3.org/2000/svg";

  var ICON_TRASH = [["M5 7h14l-1.1 13.2A2 2 0 0 1 15.9 22H8.1a2 2 0 0 1-2-1.8z"],
                    ["M3 4.6h18v2.2H3zM9.4 2h5.2v2.6H9.4z", ".35"]];
  var ICON_COPY = [["M4 2h8a2 2 0 0 1 2 2v2H8a2 2 0 0 0-2 2v8H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", ".35"],
                   ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"]];

  function icon(paths) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "rc-ic");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach(function (spec) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", spec[0]);
      if (spec[1]) path.setAttribute("opacity", spec[1]);
      svg.appendChild(path);
    });
    return svg;
  }

  function mk(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) {
      n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return n;
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
    while (b.firstChild) b.removeChild(b.firstChild);
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
    act.appendChild(icon(mode === "mark" ? ICON_TRASH : ICON_COPY));
    act.appendChild(document.createTextNode(mode === "mark" ? "Remove" : "Copy"));
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

  /* ---------- dictionary (opt-in, api.dictionaryapi.dev) ---------- */

  function wordAtPoint(x, y) {
    var node, offset;
    if (document.caretRangeFromPoint) {
      var r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    }
    if (!node || node.nodeType !== 3) return "";
    var s = node.data, a = offset, b = offset, W = /[A-Za-zÀ-ɏ'-]/;
    while (a > 0 && W.test(s.charAt(a - 1))) a--;
    while (b < s.length && W.test(s.charAt(b))) b++;
    return s.slice(a, b).replace(/^['-]+|['-]+$/g, "");
  }

  function ensureDict() {
    if (dictEl && dictEl.isConnected) return dictEl;
    dictEl = document.createElement("div");
    dictEl.id = "rc-hl-dict";
    dictEl.hidden = true;
    (document.body || document.documentElement).appendChild(dictEl);
    return dictEl;
  }

  function hideDict() { if (dictEl) dictEl.hidden = true; }

  function showDict(x, y, nodes) {
    var d = ensureDict();
    while (d.firstChild) d.removeChild(d.firstChild);
    nodes.forEach(function (n) { d.appendChild(n); });
    d.appendChild(mk("div", { "class": "rc-d-src" }, ["dictionaryapi.dev"]));
    d.hidden = false;
    d.style.visibility = "hidden";
    var dw = d.offsetWidth, dh = d.offsetHeight;
    var left = window.scrollX + x;
    var top = window.scrollY + y + 14;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - dw - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    if (y + 14 + dh > document.documentElement.clientHeight && y - dh - 6 > 0) {
      top = window.scrollY + y - dh - 6;
    }
    d.style.left = left + "px";
    d.style.top = top + "px";
    d.style.visibility = "visible";
  }

  /* The API response is reduced to a plain record (what the cache holds), then
   * turned into nodes on each show — a fragment could only be inserted once. */
  function parseEntry(data) {
    var e = data && data[0];
    if (!e) return null;
    var entry = {
      word: String(e.word == null ? "" : e.word),
      phonetic: e.phonetic || (e.phonetics || []).map(function (p) { return p.text; }).filter(Boolean)[0] || "",
      defs: []
    };
    (e.meanings || []).forEach(function (m) {
      if (entry.defs.length >= 3) return;
      (m.definitions || []).slice(0, 2).forEach(function (def) {
        if (entry.defs.length >= 3) return;
        entry.defs.push({
          pos: String(m.partOfSpeech || ""),
          text: String(def.definition == null ? "" : def.definition)
        });
      });
    });
    return entry;
  }

  function entryNodes(entry) {
    var nodes = [mk("span", { "class": "rc-d-word" }, [entry.word])];
    if (entry.phonetic) nodes.push(mk("span", { "class": "rc-d-ph" }, [String(entry.phonetic)]));
    entry.defs.forEach(function (d) {
      nodes.push(mk("p", null, [mk("span", { "class": "rc-d-pos" }, [d.pos]), " " + d.text]));
    });
    return nodes;
  }

  function messageNodes(word, message) {
    return [mk("span", { "class": "rc-d-word" }, [word]), mk("p", null, [message])];
  }

  function lookup(word, x, y) {
    var key = word.toLowerCase();
    if (dictCache[key]) { showDict(x, y, entryNodes(dictCache[key])); return; }
    showDict(x, y, messageNodes(word, "Looking up…"));
    fetch(DICT_API + encodeURIComponent(key), { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        var entry = parseEntry(data);
        if (!entry) return Promise.reject("empty");
        dictCache[key] = entry;
        showDict(x, y, entryNodes(entry));
      })
      .catch(function () {
        showDict(x, y, messageNodes(word, "No definition found."));
      });
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

  function applyEnabled() {
    var el = document.documentElement;
    if (prefs.enabled) el.removeAttribute("data-rc-hl-off");
    else el.setAttribute("data-rc-hl-off", "");
  }

  function savePrefs() {
    var o = {}; o[PREFS_KEY] = { color: prefs.color, quick: prefs.quick, enabled: prefs.enabled, dict: prefs.dict };
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
    if (!prefs.enabled) return;
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
    if (!prefs.enabled) return;
    var mark = e.target.closest && e.target.closest("mark.rc-hl");
    var sel = window.getSelection();
    if (mark && (!sel || sel.isCollapsed)) {
      e.stopPropagation();
      showBarForMark(mark);
    }
  }, true);

  /* The PDF viewer renders its pages lazily and appends reader-mode text as it
   * arrives, long after the 12s observer window would have closed. It says so
   * with this event; each one is fresh text to anchor into. */
  window.addEventListener("rc:content-changed", function () {
    restoreAll();
    scheduleRetries();
  });

  document.addEventListener("contextmenu", function (e) {
    if (!prefs.enabled || !prefs.dict) return;
    if (dictEl && dictEl.contains(e.target)) return;
    var mark = e.target.closest && e.target.closest("mark.rc-hl");
    if (!mark) return;
    var word = wordAtPoint(e.clientX, e.clientY);
    if (!word && !/\s/.test(mark.textContent.trim())) word = mark.textContent.trim();
    if (!word || word.length > 40) return;
    e.preventDefault();
    lookup(word, e.clientX, e.clientY);
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (bar && !bar.hidden && !bar.contains(e.target)) hideBar();
    if (dictEl && !dictEl.hidden && !dictEl.contains(e.target)) hideDict();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hideBar(); hideDict(); }
  }, true);
  window.addEventListener("scroll", function () { hideBar(); hideDict(); }, true);

  /* ---------- export ----------
   * Stored order is creation order, which reads as a jumble. The re-anchored
   * <mark>s are in the DOM in document order, so walk those instead and fall
   * back to the stored record for anything that didn't re-anchor this visit.
   */

  function exportItems() {
    var byId = {};
    highlights.forEach(function (h) { byId[h.id] = h; });

    var out = [], seen = {};
    Array.prototype.forEach.call(document.querySelectorAll("mark.rc-hl"), function (m) {
      var id = m.dataset.id;
      if (!id || seen[id]) return;
      seen[id] = true;
      var h = byId[id];
      if (!h) return;
      out.push({
        exact: h.exact, prefix: h.prefix, suffix: h.suffix,
        color: h.color, anchored: true
      });
    });
    // highlights that couldn't be re-anchored — still worth exporting, just
    // without a place in the reading order
    highlights.forEach(function (h) {
      if (seen[h.id]) return;
      out.push({
        exact: h.exact, prefix: h.prefix, suffix: h.suffix,
        color: h.color, anchored: false
      });
    });
    return out;
  }

  /* ---------- messaging ---------- */

  /* ---------- the shared action vocabulary (shortcuts and macros) ---------- */

  var COLOR_ORDER = Object.keys(COLORS);

  function highlightSelection() {
    if (!prefs.enabled) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (range.collapsed || !range.toString().trim()) return;
    if (inEditable(range.commonAncestorContainer)) return;
    hideBar();
    applyHighlight(range.cloneRange(), prefs.color);
  }

  function copyAll() {
    var text = highlights.map(function (h) { return h.exact; }).join("\n\n");
    if (!text) return;
    /* the keypress that ran the macro still counts as user activation by the
       time the action gets here, so the async clipboard is available; the old
       execCommand path covers browsers that disagree */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { copyFallback(text); });
        return;
      }
    } catch (e) {}
    copyFallback(text);
  }

  function copyFallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  function doAction(id) {
    if (typeof id !== "string") return;
    var value = null, c = id.indexOf(":");
    if (c > 0) { value = id.slice(c + 1); id = id.slice(0, c); }

    switch (id) {
      case "hl-toggle":       setEnabled(!prefs.enabled); break;
      case "hl":              setEnabled(value === "on"); break;
      case "hl-quick-toggle": prefs.quick = !prefs.quick; savePrefs(); break;
      case "hl-quick":        prefs.quick = value === "on"; savePrefs(); break;
      case "hl-selection":    highlightSelection(); break;
      case "hl-color":
        if (COLORS[value]) { prefs.color = value; savePrefs(); }
        break;
      case "hl-color-cycle":
        prefs.color = COLOR_ORDER[(COLOR_ORDER.indexOf(prefs.color) + 1) % COLOR_ORDER.length];
        savePrefs();
        break;
      case "hl-copy":  copyAll(); break;
      case "hl-clear": clearPage(); break;
    }
  }

  function setEnabled(on) {
    prefs.enabled = !!on;
    applyEnabled();
    if (!prefs.enabled) { hideBar(); hideDict(); }
    savePrefs();
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "rc:action") { doAction(msg.action); return; }
    if (msg.type === "rc:actions" && Array.isArray(msg.actions)) { msg.actions.forEach(doAction); return; }
    if (msg.type === "rc:hlGetState") {
      sendResponse({
        count: highlights.length,
        restoredCount: Object.keys(restored).length,
        color: prefs.color,
        quick: prefs.quick,
        enabled: prefs.enabled,
        dict: prefs.dict,
        colors: COLORS
      });
      return true;
    }
    if (msg.type === "rc:hlSet") {
      if (typeof msg.color === "string") prefs.color = msg.color;
      if (typeof msg.quick === "boolean") prefs.quick = msg.quick;
      if (typeof msg.dict === "boolean") { prefs.dict = msg.dict; if (!prefs.dict) hideDict(); }
      if (typeof msg.enabled === "boolean") { prefs.enabled = msg.enabled; applyEnabled(); if (!prefs.enabled) { hideBar(); hideDict(); } }
      savePrefs();
    }
    if (msg.type === "rc:hlCopyAll") {
      sendResponse({ text: highlights.map(function (h) { return h.exact; }).join("\n\n") });
      return true;
    }
    if (msg.type === "rc:hlExport") {
      sendResponse({ items: exportItems() });
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
      applyEnabled();
    }
  });

  /* ---------- boot ---------- */

  if (document.body) load();
  else document.addEventListener("DOMContentLoaded", load);
})();
