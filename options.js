/* Reader Comfort — settings page.
 *
 * The shortcut editor. Everything here is built as DOM nodes rather than
 * markup strings: the add-on reviewers flag innerHTML assignment, and the
 * rest of the extension was moved off it in 1.8.1.
 */
(function () {
  "use strict";

  var RC = window.RC_ACTIONS;
  var $ = function (id) { return document.getElementById(id); };

  var binds = [];
  var macroPrefs = { toast: true };
  var globalSettings = {};
  var commandChords = [];        // chords the browser's own commands already own
  var recording = null;          // { bind, keyBtn, msgEl }

  /* ---------- tiny DOM helpers ---------- */

  function mk(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) {
      n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return n;
  }

  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function newId() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- persistence ---------- */

  var saveT = null;

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      /* storage.sync caps a single key at 8KB; a binding is tiny, but say so
         rather than letting the write fail silently */
      if (JSON.stringify(binds).length > 7500) {
        alert("That's more shortcuts than browser sync will hold. Remove a few first.");
        return;
      }
      chrome.storage.sync.set({ binds: binds }, function () {
        if (chrome.runtime.lastError) return;
        flashSaved();
      });
    }, 250);
  }

  var savedT = null;
  function flashSaved() {
    var el = $("saved");
    el.setAttribute("data-show", "");
    clearTimeout(savedT);
    savedT = setTimeout(function () { el.removeAttribute("data-show"); }, 1200);
  }

  /* ---------- validation ---------- */

  function taken(chord, except) {
    if (commandChords.indexOf(chord) >= 0) return true;
    return binds.some(function (b) { return b !== except && b.chord === chord; });
  }

  /* what, if anything, is wrong with this binding right now */
  function problem(b) {
    if (!b.chord) {
      return { level: "error", message: "No key yet — click the key button, then press the combination you want." };
    }
    var v = RC.validateChord(b.chord);
    if (v.level === "error") return v;
    if (commandChords.indexOf(b.chord) >= 0) {
      return { level: "error", message: RC.chordLabel(b.chord) + " is a built-in browser shortcut. It would run that instead." };
    }
    if (binds.some(function (x) { return x !== b && x.chord === b.chord; })) {
      return { level: "error", message: RC.chordLabel(b.chord) + " is already used by another shortcut here." };
    }
    if (!b.actions.length) {
      return { level: "error", message: "Add at least one step below." };
    }
    return v.level ? v : null;
  }

  function summary(b) {
    if (!b.actions.length) return "Nothing to do yet.";
    var what = b.actions.map(RC.labelFor).join("  →  ");
    return (b.actions.length > 1 ? "Macro: " : "Does: ") + what;
  }

  /* ---------- one binding row ---------- */

  function paintKey(btn, b) {
    btn.textContent = b.chord ? RC.chordLabel(b.chord) : "Set a key…";
    btn.setAttribute("data-set", String(!!b.chord));
    btn.setAttribute("title", "Click, then press the keys you want");
  }

  function bindRow(b) {
    var row = mk("div", { class: "bind", "data-id": b.id, "data-off": String(!b.on) });
    var msg = mk("p", { class: "msg" });
    var does = mk("p", { class: "does" });

    /* --- top line: name, key, on/off, remove --- */
    var top = mk("div", { class: "bindtop" });

    var name = mk("input", { class: "bindname", type: "text", placeholder: "Name it (optional)" });
    name.value = b.name || "";
    name.addEventListener("input", function () {
      b.name = name.value;
      does.textContent = summary(b);
      save();
    });

    var key = mk("button", { class: "key", type: "button" });
    paintKey(key, b);
    key.addEventListener("click", function () { startRecord(b, key, msg); });

    var onWrap = mk("label", { class: "sw" });
    var onBox = mk("input", { type: "checkbox" });
    onBox.checked = b.on;
    onBox.addEventListener("change", function () {
      b.on = onBox.checked;
      row.setAttribute("data-off", String(!b.on));
      save();
    });
    onWrap.appendChild(onBox);
    onWrap.appendChild(document.createTextNode("On"));

    var del = mk("button", { class: "mini danger", type: "button" }, ["Remove"]);
    del.addEventListener("click", function () {
      binds = binds.filter(function (x) { return x !== b; });
      save(); renderBinds(); renderSuggestions();
    });

    top.appendChild(name);
    top.appendChild(key);
    top.appendChild(onWrap);
    top.appendChild(del);
    row.appendChild(top);

    /* --- warning line --- */
    var p = problem(b);
    setMsg(msg, p);
    row.appendChild(msg);

    /* --- the steps --- */
    var steps = mk("div", { class: "steps" });
    b.actions.forEach(function (a, i) {
      steps.appendChild(stepChip(b, a, i));
    });
    steps.appendChild(addStepSelect(b));
    row.appendChild(steps);

    does.textContent = summary(b);
    row.appendChild(does);
    return row;
  }

  function setMsg(el, p) {
    if (!p) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = p.message;
    el.setAttribute("data-level", p.level);
  }

  function stepChip(b, action, i) {
    var chip = mk("span", { class: "step" });
    chip.appendChild(mk("span", { class: "n" }, [String(i + 1) + "."]));
    chip.appendChild(document.createTextNode(RC.labelFor(action)));

    if (b.actions.length > 1) {
      var up = mk("button", { type: "button", title: "Move earlier", "aria-label": "Move earlier" }, ["▲"]);
      up.disabled = i === 0;
      up.addEventListener("click", function () { move(b, i, -1); });
      var down = mk("button", { type: "button", title: "Move later", "aria-label": "Move later" }, ["▼"]);
      down.disabled = i === b.actions.length - 1;
      down.addEventListener("click", function () { move(b, i, 1); });
      chip.appendChild(up);
      chip.appendChild(down);
    }

    var x = mk("button", { class: "x", type: "button", title: "Remove this step", "aria-label": "Remove this step" }, ["✕"]);
    x.addEventListener("click", function () {
      b.actions.splice(i, 1);
      save(); renderBinds();
    });
    chip.appendChild(x);
    return chip;
  }

  function move(b, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= b.actions.length) return;
    var tmp = b.actions[i];
    b.actions[i] = b.actions[j];
    b.actions[j] = tmp;
    save(); renderBinds();
  }

  function addStepSelect(b) {
    var sel = mk("select", { class: "addstep", "aria-label": "Add a step" });
    sel.appendChild(mk("option", { value: "" }, [b.actions.length ? "+ Add another step…" : "+ Choose what it does…"]));
    RC.GROUPS.forEach(function (g) {
      var og = mk("optgroup", { label: g.label });
      RC.ACTIONS.forEach(function (a) {
        if (a.group === g.id) og.appendChild(mk("option", { value: a.id }, [a.label]));
      });
      sel.appendChild(og);
    });
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      b.actions.push(sel.value);
      save(); renderBinds();
    });
    return sel;
  }

  /* ---------- recording a chord ---------- */

  function startRecord(b, keyBtn, msgEl) {
    stopRecord();
    recording = { bind: b, keyBtn: keyBtn, msgEl: msgEl };
    keyBtn.setAttribute("data-rec", "true");
    keyBtn.textContent = "Press keys…";
    setMsg(msgEl, { level: "warn", message: "Listening. Press the combination you want, or Esc to cancel." });
    window.addEventListener("keydown", onRecKey, true);
    window.addEventListener("keyup", onRecKey, true);
    window.addEventListener("blur", cancelRecord);
  }

  function stopRecord() {
    if (!recording) return;
    recording.keyBtn.removeAttribute("data-rec");
    recording = null;
    window.removeEventListener("keydown", onRecKey, true);
    window.removeEventListener("keyup", onRecKey, true);
    window.removeEventListener("blur", cancelRecord);
  }

  function cancelRecord() {
    stopRecord();
    renderBinds();
  }

  function onRecKey(e) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "keyup") {
      /* nothing committed yet — just keep the modifier preview honest */
      if (RC.chordFromEvent(e)) return;
      showPreview(e);
      return;
    }
    if (e.key === "Escape") { cancelRecord(); return; }

    var chord = RC.chordFromEvent(e);
    if (!chord) { showPreview(e); return; }   // modifiers still going down

    var v = RC.validateChord(chord);
    if (v.level === "error") {
      recording.keyBtn.textContent = RC.chordLabel(chord) + " ✕";
      setMsg(recording.msgEl, v);
      return;                                  // stay in recording mode, try again
    }
    if (taken(chord, recording.bind)) {
      recording.keyBtn.textContent = RC.chordLabel(chord) + " ✕";
      setMsg(recording.msgEl, { level: "error", message: RC.chordLabel(chord) + " is already taken. Try another." });
      return;
    }

    recording.bind.chord = chord;
    stopRecord();
    save();
    renderBinds();
  }

  function showPreview(e) {
    var mods = RC.modifierPreview(e);
    recording.keyBtn.textContent = mods.length
      ? RC.chordLabel(mods.join("+")) + " + …"
      : "Press keys…";
  }

  /* ---------- lists ---------- */

  function renderBinds(focusId, record) {
    var list = $("bindList");
    clear(list);

    if (!binds.length) {
      list.appendChild(mk("p", { class: "empty" },
        ["No shortcuts of your own yet. Add one below, or start from a ready-made macro."]));
      return;
    }

    binds.forEach(function (b) { list.appendChild(bindRow(b)); });

    if (focusId) {
      var row = list.querySelector('[data-id="' + focusId + '"]');
      if (row) {
        var key = row.querySelector(".key");
        if (key) {
          key.focus();
          if (record) {
            var b = binds.filter(function (x) { return x.id === focusId; })[0];
            if (b) startRecord(b, key, row.querySelector(".msg"));
          }
        }
      }
    }
  }

  function renderSuggestions() {
    var box = $("suggest");
    clear(box);
    RC.SUGGESTIONS.forEach(function (sg) {
      var already = binds.some(function (b) {
        return b.actions.join("|") === sg.actions.join("|");
      });
      var btn = mk("button", { type: "button" }, [sg.name + "  ·  " + RC.chordLabel(sg.chord)]);
      btn.title = sg.actions.map(RC.labelFor).join("  →  ");
      if (already) btn.disabled = true;
      btn.addEventListener("click", function () { addBind(sg); });
      box.appendChild(btn);
    });
  }

  function addBind(seed) {
    var chord = seed && seed.chord ? seed.chord : "";
    /* rather than drop the user into a conflict, ask for a key instead */
    if (chord && taken(chord, null)) chord = "";
    var b = {
      id: newId(),
      name: seed ? seed.name : "",
      chord: chord,
      actions: seed ? seed.actions.slice() : [],
      on: true
    };
    binds.push(b);
    save();
    renderBinds(b.id, !chord);
    renderSuggestions();
  }

  /* ---------- the browser's own shortcuts ---------- */

  function kbdRow(shortcut) {
    var td = mk("td", { class: "k" });
    if (!shortcut) { td.appendChild(mk("kbd", { class: "unset" }, ["not set"])); return td; }
    shortcut.split("+").forEach(function (part, i) {
      if (i) td.appendChild(document.createTextNode(" + "));
      td.appendChild(mk("kbd", {}, [part]));
    });
    return td;
  }

  function loadCommands() {
    if (!chrome.commands || !chrome.commands.getAll) return;
    chrome.commands.getAll(function (cmds) {
      var body = $("cmdList");
      clear(body);
      (cmds || []).forEach(function (c) {
        var label = c.description || c.name;
        if (c.name === "_execute_action") label = "Open the Reader Comfort panel";
        var tr = mk("tr");
        tr.appendChild(mk("td", {}, [label]));
        tr.appendChild(kbdRow(c.shortcut));
        body.appendChild(tr);
      });
    });

    /* the background owns the one normalizer that turns the browser's
       shortcut strings into the chord format the editor speaks */
    chrome.runtime.sendMessage({ type: "rc:getCommandChords" }, function (resp) {
      void chrome.runtime.lastError;
      if (resp && Array.isArray(resp.chords)) {
        commandChords = resp.chords;
        renderBinds();
      }
    });
  }

  var isFirefox = chrome.runtime.getURL("").indexOf("moz-extension") === 0;

  $("openShortcuts").addEventListener("click", function () {
    var url = isFirefox ? "about:addons" : "chrome://extensions/shortcuts";
    chrome.tabs.create({ url: url }, function () {
      if (chrome.runtime.lastError) {
        setMsg($("cmdHint"), {
          level: "warn",
          message: "Open " + url + " yourself — the browser won't let an extension open it."
        });
      }
    });
  });

  if (isFirefox) {
    setMsg($("cmdHint"), {
      level: "warn",
      message: "In Firefox: Add-ons → the gear icon → Manage Extension Shortcuts."
    });
  }

  /* ---------- gestures ---------- */

  function wireGesture(id, key, fallback) {
    var el = $(id);
    el.checked = globalSettings[key] !== false && (globalSettings[key] !== undefined ? !!globalSettings[key] : fallback);
    el.addEventListener("change", function () {
      globalSettings[key] = el.checked;
      chrome.storage.sync.set({ global: globalSettings }, function () {
        if (!chrome.runtime.lastError) flashSaved();
      });
    });
  }

  /* Alt is Option on a Mac — say what is actually printed on the key */
  function localizeMods(sel) {
    if (!RC || !RC.isMac) return;
    Array.prototype.forEach.call(sel.options, function (o) {
      o.textContent = o.textContent.replace("Alt", "Option");
    });
  }

  /* a menu that edits one all-sites setting, greyed while `gate` is unticked */
  function wireChoice(id, key, fallback, gate) {
    var el = $(id);
    localizeMods(el);
    el.value = globalSettings[key] || fallback;
    var gateEl = gate && $(gate);
    var sync = function () { if (gateEl) el.disabled = !gateEl.checked; };
    sync();
    if (gateEl) gateEl.addEventListener("change", sync);
    el.addEventListener("change", function () {
      globalSettings[key] = el.value;
      chrome.storage.sync.set({ global: globalSettings }, function () {
        if (!chrome.runtime.lastError) flashSaved();
      });
    });
  }

  /* ---------- boot ---------- */

  chrome.storage.sync.get(["binds", "macroPrefs", "global"], function (store) {
    store = store || {};
    binds = Array.isArray(store.binds) ? store.binds : [];
    binds.forEach(function (b) {
      if (!b.id) b.id = newId();
      if (!Array.isArray(b.actions)) b.actions = [];
      if (b.on === undefined) b.on = true;
    });
    macroPrefs = Object.assign({ toast: true }, store.macroPrefs || {});
    globalSettings = store.global || {};

    wireGesture("rulerDblclick", "rulerDblclick", true);
    wireGesture("rulerWheel", "rulerWheel", true);
    wireChoice("rulerWheelMod", "rulerWheelMod", "alt-shift", "rulerWheel");

    var toast = $("macroToast");
    toast.checked = macroPrefs.toast !== false;
    toast.addEventListener("change", function () {
      macroPrefs.toast = toast.checked;
      chrome.storage.sync.set({ macroPrefs: macroPrefs }, function () {
        if (!chrome.runtime.lastError) flashSaved();
      });
    });

    renderBinds();
    renderSuggestions();
    loadCommands();
  });

  $("addBind").addEventListener("click", function () { addBind(null); });

  $("clearAll").addEventListener("click", function () {
    if (!binds.length) return;
    if (!confirm("Remove every shortcut you've made here?")) return;
    binds = [];
    save();
    renderBinds();
    renderSuggestions();
  });
})();
