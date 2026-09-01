/* Reader Comfort — popup */
(function () {
  "use strict";

  var DEFAULTS = {
    enabled: true, tint: "off", size: 100, leading: "off", spacing: "off",
    font: "off", measure: "off", ruler: false, rulerHeight: 130,
    rulerDblclick: true, killItalics: false, linkUnderline: false, reduceMotion: false
  };

  var tabId = null;
  var origin = null;
  var scope = "global";          // "global" | "site"
  var hasOverride = false;
  var globalSettings = Object.assign({}, DEFAULTS);
  var s = Object.assign({}, DEFAULTS);   // the layer currently being edited

  var $ = function (id) { return document.getElementById(id); };
  var controls = $("controls");
  var scopeNote = $("scopeNote");

  /* ---------- boot ---------- */

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      degrade("Reader Comfort only works on normal web pages.");
      return;
    }
    tabId = tab.id;
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
    var old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1200);
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
