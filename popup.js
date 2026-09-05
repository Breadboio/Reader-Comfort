/* Reader Comfort — popup */
(function () {
  "use strict";

  var DEFAULTS = {
    enabled: true, tint: "off", size: 100, leading: "off", spacing: "off",
    font: "off", measure: "off", ruler: false, rulerHeight: 130,
    rulerDblclick: true, killItalics: false, linkUnderline: false, reduceMotion: false
  };

  var tabId = null;
  var currentTab = null;      // kept for the export's page title / url
  var origin = null;
  var scope = "global";          // "global" | "site"
  var hasOverride = false;
  var globalSettings = Object.assign({}, DEFAULTS);
  var s = Object.assign({}, DEFAULTS);   // the layer currently being edited

  var $ = function (id) { return document.getElementById(id); };
  var controls = $("controls");
  var scopeNote = $("scopeNote");

  /* ---------- run-on-all-sites permission (mainly a Firefox thing) ---------- */

  (function permGate() {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    var ALL = { origins: ["<all_urls>"] };
    var refresh = function () {
      chrome.permissions.contains(ALL, function (granted) {
        $("permBanner").hidden = !!granted;
      });
    };
    $("permGrant").addEventListener("click", function () {
      chrome.permissions.request(ALL, function (granted) {
        void chrome.runtime.lastError;
        if (granted) {
          $("permBanner").hidden = true;
          if (tabId != null) chrome.tabs.reload(tabId);
        }
      });
    });
    refresh();
  })();

  /* ---------- boot ---------- */

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      degrade("Reader Comfort only works on normal web pages.");
      return;
    }
    tabId = tab.id;
    currentTab = tab;
    chrome.tabs.sendMessage(tabId, { type: "rc:getState" }, function (resp) {
      if (chrome.runtime.lastError || !resp) {
        degrade("Reload this tab to use Reader Comfort here.");
        return;
      }
      origin = resp.origin;
      globalSettings = Object.assign({}, DEFAULTS, resp.global);
      hasOverride = resp.hasOverride;
      scope = hasOverride ? "site" : "global";
      s = Object.assign({}, DEFAULTS, scope === "site" ? resp.effective : resp.global);
      wire();
      render();
    });
    initHighlighter();
    initAnnotate();
    initNotes();
    initExport();
  });

  function degrade(msg) {
    controls.classList.add("disabled");
    scopeNote.textContent = msg;
    scopeNote.style.color = "var(--ink)";
  }

  /* ---------- highlighter ---------- */

  function hlSend(msg, cb) {
    if (tabId == null) { if (cb) cb(null); return; }
    chrome.tabs.sendMessage(tabId, msg, function (resp) {
      void chrome.runtime.lastError;
      if (cb) cb(resp);
    });
  }

  function initHighlighter() {
    hlSend({ type: "rc:hlGetState" }, function (st) {
      if (!st) { $("hlSection").classList.add("disabled"); return; }
      paintHlColor(st.color);
      $("hlQuick").checked = !!st.quick;
      $("hlDict").checked = !!st.dict;
      $("hlDictNote").hidden = !st.dict;
      $("hlEnabled").setAttribute("aria-pressed", String(st.enabled !== false));
      paintHlCount(st.count, st.restoredCount);
    });

    $("hlDict").addEventListener("change", function () {
      $("hlDictNote").hidden = !this.checked;
      hlSend({ type: "rc:hlSet", dict: this.checked });
    });

    $("hlEnabled").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") !== "true";
      this.setAttribute("aria-pressed", String(on));
      hlSend({ type: "rc:hlSet", enabled: on });
    });
    $("hlColor").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-hlc]");
      if (!btn) return;
      var c = btn.getAttribute("data-hlc");
      paintHlColor(c);
      hlSend({ type: "rc:hlSet", color: c });
    });
    $("hlQuick").addEventListener("change", function () {
      hlSend({ type: "rc:hlSet", quick: this.checked });
    });
    $("hlCopy").addEventListener("click", function () {
      hlSend({ type: "rc:hlCopyAll" }, function (resp) {
        var text = (resp && resp.text) || "";
        if (!text) { flash($("hlCopy"), "Nothing"); return; }
        navigator.clipboard.writeText(text).then(
          function () { flash($("hlCopy"), "Copied"); },
          function () { flash($("hlCopy"), "Failed"); });
      });
    });
    $("hlClear").addEventListener("click", function () {
      hlSend({ type: "rc:hlClearPage" }, function () {
        paintHlCount(0, 0);
        flash($("hlClear"), "Cleared");
      });
    });
  }

  function paintHlColor(c) {
    Array.prototype.forEach.call($("hlColor").querySelectorAll("[data-hlc]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-hlc") === c));
    });
  }

  function paintHlCount(count, restoredCount) {
    var el = $("hlCount");
    if (!count) { el.textContent = "No highlights on this page"; return; }
    var s = count + (count === 1 ? " highlight" : " highlights");
    if (restoredCount != null && restoredCount < count) {
      s += " (" + (count - restoredCount) + " not found on this version of the page)";
    }
    el.textContent = s;
  }

  function flash(btn, text) {
    var lbl = btn.querySelector(".lbl") || btn;
    var old = lbl.textContent;
    lbl.textContent = text;
    setTimeout(function () { lbl.textContent = old; }, 1200);
  }

  /* ---------- annotate (draw) ---------- */

  function drSend(msg, cb) { hlSend(msg, cb); }

  function initAnnotate() {
    drSend({ type: "rc:drawGetState" }, function (st) {
      if (!st) { $("drSection").classList.add("disabled"); return; }
      $("drMode").setAttribute("aria-pressed", String(!!st.drawMode));
      paintDrColor(st.color);
      paintDrWidth(st.width);
      paintDrTool(st.tool);
      paintDrCount(st.count);
    });

    $("drMode").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") !== "true";
      this.setAttribute("aria-pressed", String(on));
      drSend({ type: "rc:drawSet", drawMode: on }, function () {
        drSend({ type: "rc:drawGetState" }, function (st) { if (st) paintDrCount(st.count); });
      });
    });
    $("drColor").addEventListener("click", function (e) {
      var b = e.target.closest("[data-drc]"); if (!b) return;
      var c = b.getAttribute("data-drc");
      paintDrColor(c);
      drSend({ type: "rc:drawSet", color: c });
    });
    $("drWidth").addEventListener("click", function (e) {
      var b = e.target.closest("[data-drw]"); if (!b) return;
      var w = b.getAttribute("data-drw");
      paintDrWidth(w);
      drSend({ type: "rc:drawSet", width: w });
    });
    $("drTool").addEventListener("click", function (e) {
      var b = e.target.closest("[data-drt]"); if (!b) return;
      var t = b.getAttribute("data-drt");
      paintDrTool(t);
      drSend({ type: "rc:drawSet", tool: t });
    });
    $("drUndo").addEventListener("click", function () {
      drSend({ type: "rc:drawUndo" }, function () {
        drSend({ type: "rc:drawGetState" }, function (st) { if (st) paintDrCount(st.count); });
      });
    });
    $("drClear").addEventListener("click", function () {
      drSend({ type: "rc:drawClearPage" }, function () {
        paintDrCount(0);
        flash($("drClear"), "Cleared");
      });
    });
  }

  function paintDrColor(c) {
    Array.prototype.forEach.call($("drColor").querySelectorAll("[data-drc]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-drc") === c));
    });
  }
  function paintDrWidth(w) {
    Array.prototype.forEach.call($("drWidth").querySelectorAll("[data-drw]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-drw") === w));
    });
  }
  function paintDrTool(t) {
    Array.prototype.forEach.call($("drTool").querySelectorAll("[data-drt]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-drt") === t));
    });
  }
  function paintDrCount(count) {
    $("drCount").textContent = count ? (count + (count === 1 ? " annotation" : " annotations")) : "No annotations on this page";
  }

  /* ---------- sticky notes ---------- */

  function initNotes() {
    hlSend({ type: "rc:notesGetState" }, function (st) {
      if (!st) { $("ntSection").classList.add("disabled"); return; }
      paintNtColor(st.color);
      paintNtCount(st.count);
    });
    $("ntColor").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ntc]"); if (!b) return;
      var c = b.getAttribute("data-ntc");
      paintNtColor(c);
      hlSend({ type: "rc:notesSet", color: c });
    });
    $("ntAdd").addEventListener("click", function () {
      hlSend({ type: "rc:notesAdd" }, function (resp) {
        if (resp) paintNtCount(resp.count);
        flash($("ntAdd"), "Added");
      });
    });
    $("ntClear").addEventListener("click", function () {
      hlSend({ type: "rc:notesClearPage" }, function () {
        paintNtCount(0);
        flash($("ntClear"), "Cleared");
      });
    });
  }

  function paintNtColor(c) {
    Array.prototype.forEach.call($("ntColor").querySelectorAll("[data-ntc]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-ntc") === c));
    });
  }
  function paintNtCount(count) {
    $("ntCount").textContent = count ? (count + (count === 1 ? " note" : " notes")) : "No notes on this page";
  }

  /* ---------- export: one self-contained .html anyone can open ---------- */

  function initExport() {
    $("exHtml").addEventListener("click", function () {
      var btn = this;
      gather(function (data) {
        if (!data.highlights.length && !data.notes.length && !data.strokes.length) {
          flash(btn, "Nothing yet");
          return;
        }
        download(fileName(data.title), buildHtml(data));
        flash(btn, "Saved");
      });
    });
  }

  function gather(done) {
    var data = {
      title: (currentTab && currentTab.title) || "Untitled page",
      url: (currentTab && currentTab.url) || "",
      date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
      highlights: [], notes: [], strokes: []
    };
    hlSend({ type: "rc:hlExport" }, function (h) {
      if (h && h.items) data.highlights = h.items;
      hlSend({ type: "rc:notesExport" }, function (n) {
        if (n && n.items) data.notes = n.items;
        hlSend({ type: "rc:drawExport" }, function (dr) {
          if (dr && dr.strokes) data.strokes = dr.strokes;
          done(data);
        });
      });
    });
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fileName(title) {
    var slug = String(title).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
    return "highlights-" + slug + ".html";
  }

  /* Ink lives in document coordinates, which mean nothing without the page
     underneath. Crop to the drawing's own bounding box so it reads as a sketch
     rather than a speck on a page-sized canvas. */
  function inkSvg(strokes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(function (st) {
      st.points.forEach(function (p) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      });
    });
    if (!isFinite(minX)) return "";
    var pad = 16;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    var w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    var paths = strokes.map(function (st) {
      var dAttr = st.points.map(function (p, i) {
        return (i ? "L" : "M") + Math.round(p[0]) + " " + Math.round(p[1]);
      }).join(" ");
      return '<path d="' + dAttr + '" fill="none" stroke="' + esc(st.color) +
        '" stroke-width="' + st.width + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join("");
    return '<svg viewBox="' + Math.round(minX) + " " + Math.round(minY) + " " +
      Math.round(w) + " " + Math.round(h) + '" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="Freehand drawing made over the page">' + paths + "</svg>";
  }

  function buildHtml(d) {
    // opaque equivalents of the on-page translucent highlight colours
    var HL = { yellow: "#ffe680", green: "#b6efc4", pink: "#ffc4de", blue: "#c2d9ff" };
    var NT = {
      yellow: { bg: "#fff4b8", bar: "#f4e08a" }, pink: { bg: "#ffd9e8", bar: "#f4b7cf" },
      blue: { bg: "#d6e8ff", bar: "#b3d1f7" }, green: { bg: "#d6f5df", bar: "#b0e6c2" }
    };
    var p = [];

    p.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
    p.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    p.push("<title>" + esc(d.title) + " — highlights</title><style>");
    p.push(
      ":root{--paper:#faf7f0;--card:#fff;--ink:#26221c;--soft:#6b6355;--rule:#e3dbc9}" +
      "@media(prefers-color-scheme:dark){:root{--paper:#1b1f24;--card:#232830;--ink:#e6e9ee;--soft:#a0a8b4;--rule:#39404a}}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;background:var(--paper);color:var(--ink);padding:32px 20px 64px;" +
      "font:16px/1.65 Georgia,'Iowan Old Style',serif}" +
      ".wrap{max-width:720px;margin:0 auto}" +
      "header{border-bottom:3px solid var(--rule);padding-bottom:18px;margin-bottom:28px}" +
      "h1{font-size:26px;line-height:1.25;margin:0 0 8px}" +
      "h2{font:600 12px/1 system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;" +
      "color:var(--soft);margin:38px 0 14px}" +
      ".meta{font:13px/1.5 system-ui,sans-serif;color:var(--soft);margin:0}" +
      "figure{margin:0 0 18px;background:var(--card);border:1px solid var(--rule);" +
      "border-radius:10px;padding:16px 18px}" +
      "blockquote{margin:0;font-size:17px}" +
      "mark{padding:1px 2px;border-radius:2px;color:#26221c}" +
      ".ctx{color:var(--soft);font-size:15px}" +
      ".gone{font:12px/1.4 system-ui,sans-serif;color:var(--soft);margin:10px 0 0;font-style:italic}" +
      ".stickynote{border-radius:10px;padding:14px 16px;margin:0 0 14px;color:#2a2510;" +
      "font:15px/1.6 system-ui,sans-serif;white-space:pre-wrap;border:1px solid rgba(0,0,0,.08)}" +
      ".ink{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:14px}" +
      ".ink svg{display:block;width:100%;height:auto;max-height:70vh}" +
      "footer{margin-top:46px;padding-top:16px;border-top:1px solid var(--rule);" +
      "font:12px/1.6 system-ui,sans-serif;color:var(--soft)}"
    );
    p.push("</style></head><body><div class=wrap>");

    p.push("<header><h1>" + esc(d.title) + "</h1>");
    p.push('<p class="meta">Highlights and notes saved ' + esc(d.date));
    if (d.url) p.push(' &middot; <a href="' + esc(d.url) + '">view the original page</a>');
    p.push("</p></header>");

    if (d.highlights.length) {
      p.push("<h2>" + d.highlights.length +
        (d.highlights.length === 1 ? " highlight" : " highlights") + "</h2>");
      d.highlights.forEach(function (h) {
        p.push("<figure><blockquote>");
        if (h.prefix) p.push('<span class="ctx">' + esc(h.prefix) + "</span>");
        p.push('<mark style="background:' + (HL[h.color] || HL.yellow) + '">' +
          esc(h.exact) + "</mark>");
        if (h.suffix) p.push('<span class="ctx">' + esc(h.suffix) + "</span>");
        p.push("</blockquote>");
        if (h.anchored === false) {
          p.push('<p class="gone">This passage was not on the page when the file ' +
            "was saved — the page may have changed since it was highlighted.</p>");
        }
        p.push("</figure>");
      });
    }

    if (d.notes.length) {
      p.push("<h2>" + d.notes.length + (d.notes.length === 1 ? " note" : " notes") + "</h2>");
      d.notes.forEach(function (n) {
        var c = NT[n.color] || NT.yellow;
        p.push('<div class="stickynote" style="background:' + c.bg +
          ";border-left:6px solid " + c.bar + '">' + esc(n.text) + "</div>");
      });
    }

    if (d.strokes.length) {
      p.push("<h2>Drawing</h2>");
      p.push('<div class="ink">' + inkSvg(d.strokes) + "</div>");
      p.push('<p class="meta" style="margin-top:10px">Drawn over the page itself, ' +
        "so it is shown here without the page beneath it.</p>");
    }

    p.push("<footer>Saved with Reader Comfort. This file is self-contained — " +
      "it loads nothing and reports nothing.</footer>");
    p.push("</div></body></html>");
    return p.join("");
  }

  function download(name, html) {
    var url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /* ---------- persistence + live preview ---------- */

  function commit() {
    if (scope === "global") {
      globalSettings = Object.assign({}, s);
      chrome.storage.sync.set({ global: globalSettings });
    } else {
      chrome.storage.sync.get(["sites"], function (store) {
        var sites = (store && store.sites) || {};
        sites[origin] = Object.assign({}, s);
        hasOverride = true;
        chrome.storage.sync.set({ sites: sites });
        renderScope();
      });
    }
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, { type: "rc:previewApply", settings: s }, function () {
        void chrome.runtime.lastError;
      });
    }
  }

  /* ---------- rendering ---------- */

  function pressGroup(containerId, attr, value) {
    var group = $(containerId);
    Array.prototype.forEach.call(group.querySelectorAll("[" + attr + "]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === String(value)));
    });
  }

  function render() {
    $("enabled").setAttribute("aria-pressed", String(s.enabled));
    controls.classList.toggle("disabled", !s.enabled);
    controls.querySelector(".row").classList.remove("disabled"); // keep scope row active

    pressGroup("tint", "data-tint", s.tint);
    pressGroup("leading", "data-leading", s.leading);
    pressGroup("spacing", "data-spacing", s.spacing);
    pressGroup("font", "data-font", s.font);
    pressGroup("measure", "data-measure", s.measure);
    $("sizeVal").textContent = s.size + "%";
    $("ruler").setAttribute("aria-pressed", String(s.ruler));
    $("rulerHeight").value = s.rulerHeight;
    $("rulerDblclick").checked = s.rulerDblclick !== false;
    $("killItalics").checked = s.killItalics;
    $("linkUnderline").checked = s.linkUnderline;
    $("reduceMotion").checked = s.reduceMotion;
    renderScope();
  }

  function renderScope() {
    $("scopeGlobal").setAttribute("aria-pressed", String(scope === "global"));
    $("scopeSite").setAttribute("aria-pressed", String(scope === "site"));
    $("resetSite").hidden = !hasOverride;
    var host = "";
    try { host = new URL(origin).host; } catch (e) {}
    if (scope === "site") {
      scopeNote.textContent = "Editing settings for " + host + " only.";
    } else if (hasOverride) {
      scopeNote.textContent = host + " has its own settings that override these.";
    } else {
      scopeNote.textContent = "Applies to every site.";
    }
  }

  /* ---------- wiring ---------- */

  function wire() {
    $("enabled").addEventListener("click", function () {
      s.enabled = !s.enabled; render(); commit();
    });

    $("scopeGlobal").addEventListener("click", function () {
      scope = "global";
      s = Object.assign({}, DEFAULTS, globalSettings);
      render();
    });
    $("scopeSite").addEventListener("click", function () {
      scope = "site";
      // seed from what's currently visible if no override exists yet
      render();
      commit();
    });
    $("resetSite").addEventListener("click", function () {
      chrome.storage.sync.get(["sites"], function (store) {
        var sites = (store && store.sites) || {};
        delete sites[origin];
        hasOverride = false;
        scope = "global";
        chrome.storage.sync.set({ sites: sites }, function () {
          s = Object.assign({}, DEFAULTS, globalSettings);
          render();
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, { type: "rc:previewApply", settings: s }, function () {
              void chrome.runtime.lastError;
            });
          }
        });
      });
    });

    bindGroup("tint", "data-tint", "tint");
    bindGroup("leading", "data-leading", "leading");
    bindGroup("spacing", "data-spacing", "spacing");
    bindGroup("font", "data-font", "font");
    bindGroup("measure", "data-measure", "measure");

    $("sizeUp").addEventListener("click", function () { setSize(s.size + 10); });
    $("sizeDown").addEventListener("click", function () { setSize(s.size - 10); });
    $("sizeReset").addEventListener("click", function () { setSize(100); });

    $("ruler").addEventListener("click", function () {
      s.ruler = !s.ruler; render(); commit();
    });
    $("rulerHeight").addEventListener("input", function () {
      s.rulerHeight = parseInt(this.value, 10) || 130; commit();
    });

    ["rulerDblclick", "killItalics", "linkUnderline", "reduceMotion"].forEach(function (k) {
      $(k).addEventListener("change", function () { s[k] = this.checked; commit(); });
    });
  }

  function bindGroup(containerId, attr, key) {
    $(containerId).addEventListener("click", function (e) {
      var btn = e.target.closest("[" + attr + "]");
      if (!btn) return;
      s[key] = btn.getAttribute(attr);
      pressGroup(containerId, attr, s[key]);
      commit();
    });
  }

  function setSize(v) {
    s.size = Math.max(80, Math.min(220, v));
    $("sizeVal").textContent = s.size + "%";
    commit();
  }
})();
