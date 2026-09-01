/* Reader Comfort — freehand annotations
 * A full-page SVG overlay you can draw on, like the highlighter but for
 * shapes/arrows/scribbles instead of text. Strokes are stored in *document*
 * pixel coordinates and persisted per-URL, so they scroll with the page and
 * come back on reload — but (unlike the text-anchored highlighter) they will
 * drift if the page's layout changes between visits. See README.
 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var KEY = "dr:" + location.origin + location.pathname + location.search;
  var PREFS_KEY = "drawPrefs";

  var COLORS = {
    red:    "#e03131",
    orange: "#f08c00",
    yellow: "#f2c94c",
    green:  "#2fbf71",
    blue:   "#4098ff"
  };
  var WIDTHS = { s: 2, m: 4, l: 7 };

  var prefs = { drawMode: false, color: "red", width: "m", tool: "pen" };
  var strokes = [];              // [{id, color, width, points:[[x,y],...]}]
  var layer = null, bar = null, styleEl = null;
  var drawing = false, erasing = false, curPath = null, curPoints = null;
  var resizeObs = null;

  /* ---------- styling ---------- */

  function injectStyle() {
    if (styleEl && styleEl.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.id = "rc-draw-style";
    styleEl.textContent =
      "#rc-draw-layer{position:absolute;top:0;left:0;pointer-events:none;" +
        "z-index:2147483645;overflow:visible}" +
      "#rc-draw-layer[data-active='true']{pointer-events:auto;cursor:crosshair}" +
      ".rc-draw-path{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}" +
      "#rc-draw-layer[data-active='true'][data-tool='eraser'] .rc-draw-path{pointer-events:stroke}" +
      "#rc-draw-bar{position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;" +
        "flex-direction:column;gap:6px;padding:8px;background:#fff;border:1px solid rgba(0,0,0,.18);" +
        "border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.24);font:12px/1 system-ui,sans-serif}" +
      "#rc-draw-bar .rc-draw-row{display:flex;gap:5px;align-items:center}" +
      "#rc-draw-bar button{margin:0;padding:0;cursor:pointer;background:#eee;border:2px solid transparent;" +
        "border-radius:6px}" +
      "#rc-draw-bar .rc-draw-c{width:20px;height:20px;border-radius:50%;border:2px solid rgba(0,0,0,.15)}" +
      "#rc-draw-bar .rc-draw-c[aria-pressed='true']{outline:2px solid #333;outline-offset:1px}" +
      "#rc-draw-bar .rc-draw-w{width:26px;height:26px;font-weight:700;color:#222}" +
      "#rc-draw-bar .rc-draw-w[aria-pressed='true']{background:#333;color:#fff}" +
      "#rc-draw-bar .rc-draw-t{width:26px;height:26px;font-size:14px}" +
      "#rc-draw-bar .rc-draw-t[aria-pressed='true']{background:#333;color:#fff}" +
      "#rc-draw-bar .rc-draw-act{height:24px;padding:0 8px;border-radius:6px;font-weight:600;color:#222}" +
      "#rc-draw-bar .rc-draw-x{align-self:flex-end;background:none;font-size:14px;color:#666;width:20px;height:20px}";
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ---------- layer ---------- */

  function ensureLayer() {
    layer = document.getElementById("rc-draw-layer");
    if (!layer) {
      layer = document.createElementNS(SVG_NS, "svg");
      layer.id = "rc-draw-layer";
      (document.body || document.documentElement).appendChild(layer);
      layer.addEventListener("pointerdown", onPointerDown);
      layer.addEventListener("pointermove", onPointerMove);
      layer.addEventListener("pointerup", onPointerUp);
      layer.addEventListener("pointercancel", onPointerUp);
    }
    sizeLayer();
    if (!resizeObs && "ResizeObserver" in window) {
      resizeObs = new ResizeObserver(debounce(sizeLayer, 150));
      resizeObs.observe(document.documentElement);
    }
    window.addEventListener("resize", debounce(sizeLayer, 150));
  }

  function sizeLayer() {
    if (!layer) return;
    var w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    var h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    layer.setAttribute("width", w);
    layer.setAttribute("height", h);
    layer.style.width = w + "px";
    layer.style.height = h + "px";
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function round(n) { return Math.round(n * 10) / 10; }

  function pointsToPath(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) return "M" + pts[0][0] + "," + pts[0][1];
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += " Q" + pts[i][0] + "," + pts[i][1] + " " + mx + "," + my;
    }
    var last = pts[pts.length - 1];
    d += " L" + last[0] + "," + last[1];
    return d;
  }

  function renderStroke(s) {
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("class", "rc-draw-path");
    p.dataset.id = s.id;
    p.setAttribute("stroke", COLORS[s.color] || s.color);
    p.setAttribute("stroke-width", WIDTHS[s.width] || s.width || 4);
    p.setAttribute("d", pointsToPath(s.points));
    layer.appendChild(p);
  }

  /* ---------- drawing ---------- */

  function onPointerDown(e) {
    if (!prefs.drawMode) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (prefs.tool === "eraser") {
      erasing = true;
      eraseAtPoint(e);
    } else {
      drawing = true;
      curPoints = [[round(e.pageX), round(e.pageY)]];
      curPath = document.createElementNS(SVG_NS, "path");
      curPath.setAttribute("class", "rc-draw-path");
      curPath.setAttribute("stroke", COLORS[prefs.color] || prefs.color);
      curPath.setAttribute("stroke-width", WIDTHS[prefs.width]);
      curPath.setAttribute("d", pointsToPath(curPoints));
      layer.appendChild(curPath);
    }
    try { layer.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onPointerMove(e) {
    if (!prefs.drawMode) return;
    if (erasing) { eraseAtPoint(e); return; }
    if (!drawing) return;
    curPoints.push([round(e.pageX), round(e.pageY)]);
    curPath.setAttribute("d", pointsToPath(curPoints));
  }

  function onPointerUp() {
    if (erasing) { erasing = false; return; }
    if (!drawing) return;
    drawing = false;
    if (curPoints.length < 2) { curPath.remove(); curPath = null; curPoints = null; return; }
    var id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    curPath.dataset.id = id;
    strokes.push({ id: id, color: prefs.color, width: prefs.width, points: curPoints });
    curPath = null; curPoints = null;
    persist();
    paintCount();
  }

  function eraseAtPoint(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList && el.classList.contains("rc-draw-path")) {
      var id = el.dataset.id;
      el.remove();
      strokes = strokes.filter(function (s) { return s.id !== id; });
      persist();
      paintCount();
    }
  }

  function undo() {
    var last = strokes.pop();
    if (!last) return;
    var el = layer.querySelector('.rc-draw-path[data-id="' + last.id + '"]');
    if (el) el.remove();
    persist();
    paintCount();
  }

  function clearPage() {
    strokes.slice().forEach(function (s) {
      var el = layer.querySelector('.rc-draw-path[data-id="' + s.id + '"]');
      if (el) el.remove();
    });
    strokes = [];
    try { chrome.storage.local.remove(KEY); } catch (e) {}
    paintCount();
  }

  /* ---------- storage ---------- */

  function persist() {
    var obj = {}; obj[KEY] = strokes;
    try { chrome.storage.local.set(obj); } catch (e) {}
  }
  function savePrefs() {
    var obj = {}; obj[PREFS_KEY] = { color: prefs.color, width: prefs.width, tool: prefs.tool };
    try { chrome.storage.local.set(obj); } catch (e) {}
  }

  function load() {
    chrome.storage.local.get([KEY, PREFS_KEY], function (store) {
      store = store || {};
      if (store[PREFS_KEY]) prefs = Object.assign(prefs, store[PREFS_KEY]);
      strokes = Array.isArray(store[KEY]) ? store[KEY] : [];
      injectStyle();
      ensureLayer();
      strokes.forEach(renderStroke);
    });
  }

  /* ---------- mode + toolbar ---------- */

  function setDrawMode(on) {
    prefs.drawMode = on;
    layer.setAttribute("data-active", on ? "true" : "false");
    layer.setAttribute("data-tool", prefs.tool);
    if (on) { ensureBar(); bar.hidden = false; paintBar(); paintCount(); } else if (bar) bar.hidden = true;
    savePrefs();
  }

  function ensureBar() {
    if (bar && bar.isConnected) return;
    bar = document.createElement("div");
    bar.id = "rc-draw-bar";
    bar.innerHTML =
      '<div class="rc-draw-row" id="rcdTool">' +
        '<button class="rc-draw-t" data-t="pen" title="Pen">✏️</button>' +
        '<button class="rc-draw-t" data-t="eraser" title="Eraser">✖</button>' +
      "</div>" +
      '<div class="rc-draw-row" id="rcdColor"></div>' +
      '<div class="rc-draw-row" id="rcdWidth">' +
        '<button class="rc-draw-w" data-w="s">S</button>' +
        '<button class="rc-draw-w" data-w="m">M</button>' +
        '<button class="rc-draw-w" data-w="l">L</button>' +
      "</div>" +
      '<div class="rc-draw-row"><button class="rc-draw-act" id="rcdUndo">Undo</button>' +
        '<button class="rc-draw-act" id="rcdClear">Clear</button></div>' +
      '<span class="note" id="rcdCount" style="font-size:11px;color:#666"></span>' +
      '<button class="rc-draw-x" id="rcdExit" title="Exit draw mode">✕</button>';
    var colorRow = bar.querySelector("#rcdColor");
    Object.keys(COLORS).forEach(function (c) {
      var b = document.createElement("button");
      b.className = "rc-draw-c";
      b.dataset.c = c;
      b.style.background = COLORS[c];
      colorRow.appendChild(b);
    });
    bar.querySelector("#rcdTool").addEventListener("click", function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      prefs.tool = b.getAttribute("data-t"); layer.setAttribute("data-tool", prefs.tool);
      paintBar(); savePrefs();
    });
    colorRow.addEventListener("click", function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      prefs.color = b.getAttribute("data-c"); paintBar(); savePrefs();
    });
    bar.querySelector("#rcdWidth").addEventListener("click", function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      prefs.width = b.getAttribute("data-w"); paintBar(); savePrefs();
    });
    bar.querySelector("#rcdUndo").addEventListener("click", undo);
    bar.querySelector("#rcdClear").addEventListener("click", clearPage);
    bar.querySelector("#rcdExit").addEventListener("click", function () { setDrawMode(false); });
    (document.body || document.documentElement).appendChild(bar);
  }

  function paintBar() {
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll("[data-t]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-t") === prefs.tool));
    });
    Array.prototype.forEach.call(bar.querySelectorAll("[data-c]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-c") === prefs.color));
    });
    Array.prototype.forEach.call(bar.querySelectorAll("[data-w]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-w") === prefs.width));
    });
  }

  function paintCount() {
    if (bar) {
      var el = bar.querySelector("#rcdCount");
      if (el) el.textContent = strokes.length + (strokes.length === 1 ? " stroke" : " strokes");
    }
  }

  /* ---------- messaging ---------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "rc:drawGetState") {
      sendResponse({ drawMode: prefs.drawMode, color: prefs.color, width: prefs.width,
        tool: prefs.tool, count: strokes.length, colors: COLORS });
      return true;
    }
    if (msg.type === "rc:drawSet") {
      if (typeof msg.drawMode === "boolean") setDrawMode(msg.drawMode);
      if (typeof msg.color === "string") prefs.color = msg.color;
      if (typeof msg.width === "string") prefs.width = msg.width;
      if (typeof msg.tool === "string") { prefs.tool = msg.tool; layer.setAttribute("data-tool", prefs.tool); }
      paintBar(); savePrefs();
    }
    if (msg.type === "rc:drawUndo") { undo(); }
    if (msg.type === "rc:drawClearPage") { clearPage(); }
    if (msg.type === "rc:command" && msg.command === "toggle-draw-mode") { setDrawMode(!prefs.drawMode); }
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
