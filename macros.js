/* Reader Comfort — custom shortcuts and macros.
 *
 * The browser's own shortcut system (chrome.commands) caps out at a handful of
 * slots and can only be rebound from the browser's settings page, so the
 * user-defined keys live here instead: a capture-phase keydown listener that
 * matches a chord against the saved bindings and relays the resulting actions
 * to whichever module owns them.
 *
 * A binding is { id, name, chord, actions: [...], on }. One action is a
 * shortcut; several in a row are a macro.
 */
(function () {
  "use strict";

  var RC = window.RC_ACTIONS;
  if (!RC) return;                       // actions.js failed to load; do nothing

  var binds = [];
  var prefs = { toast: true };
  var commandChords = [];                // chords the browser already delivers
  var toastEl = null, toastT = null;

  /* ---------- storage ---------- */

  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (b) {
      return b && typeof b.chord === "string" && Array.isArray(b.actions) && b.actions.length;
    }).map(function (b) {
      return {
        id: String(b.id || ""),
        name: String(b.name || ""),
        chord: b.chord,
        actions: b.actions.slice(0, 12).map(String),
        on: b.on !== false
      };
    });
  }

  function load() {
    chrome.storage.sync.get(["binds", "macroPrefs"], function (store) {
      store = store || {};
      binds = normalize(store.binds);
      prefs = Object.assign({ toast: true }, store.macroPrefs || {});
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    if (changes.binds) binds = normalize(changes.binds.newValue);
    if (changes.macroPrefs) prefs = Object.assign({ toast: true }, changes.macroPrefs.newValue || {});
  });

  /* The browser fires its own commands (Alt+R and friends) no matter what we
     do. If a custom binding has been given the same chord — which the editor
     prevents, but a later change on the browser's shortcut page could still
     create — running both would toggle twice and look broken, so we stand
     down on any chord the browser owns. */
  function loadCommandChords() {
    try {
      chrome.runtime.sendMessage({ type: "rc:getCommandChords" }, function (resp) {
        void chrome.runtime.lastError;
        if (resp && Array.isArray(resp.chords)) commandChords = resp.chords;
      });
    } catch (e) {}
  }

  /* ---------- running ---------- */

  function relay(msg) {
    try {
      chrome.runtime.sendMessage({ type: "rc:relay", msg: msg }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  function run(b) {
    /* one message, not one per step: the round trip through the background is
       what orders them, and a macro must not arrive shuffled */
    relay({ type: "rc:actions", actions: b.actions });
    if (prefs.toast !== false) toast(describe(b));
  }

  function describe(b) {
    if (b.name) return b.name;
    return b.actions.map(RC.labelFor).join(" → ");
  }

  function toast(text) {
    if (!document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.getElementById("rc-toast");
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.id = "rc-toast";
        toastEl.setAttribute("aria-hidden", "true");
      }
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.setAttribute("data-show", "");
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      if (toastEl) toastEl.removeAttribute("data-show");
    }, 1100);
  }

  /* ---------- the key listener ---------- */

  var EDITABLE = "input,textarea,select,[contenteditable=''],[contenteditable='true']";

  function inEditable(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (el && el.closest && el.closest(EDITABLE)) return true;
    var active = document.activeElement;
    if (active && active !== document.body && active.closest && active.closest(EDITABLE)) return true;
    /* a focused custom element with its own editor, e.g. a code editor widget */
    if (active && active.isContentEditable) return true;
    return false;
  }

  document.addEventListener("keydown", function (e) {
    if (!binds.length) return;
    if (e.isComposing || e.repeat || e.defaultPrevented) return;
    if (inEditable(e.target)) return;

    var chord = RC.chordFromEvent(e);
    if (!chord) return;
    if (commandChords.indexOf(chord) >= 0) return;

    for (var i = 0; i < binds.length; i++) {
      if (binds[i].on && binds[i].chord === chord) {
        e.preventDefault();
        e.stopPropagation();
        run(binds[i]);
        return;
      }
    }
  }, true);

  /* ---------- boot ---------- */

  load();
  loadCommandChords();
})();
