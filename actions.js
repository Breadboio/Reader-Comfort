/* Reader Comfort — the shared vocabulary for shortcuts and macros.
 *
 * Loaded twice, on purpose:
 *   1. as the first content script, so macros.js can read it (content scripts
 *      from one extension share an isolated world, so a plain global works);
 *   2. by options.html, which builds the editor UI from the same tables.
 *
 * Keeping one catalogue means an action added here shows up in the editor and
 * is runnable the same day — the only other edit is the module that owns it.
 */
(function (scope) {
  "use strict";

  /* ---------- action catalogue ---------- */

  var GROUPS = [
    { id: "reading", label: "Reading tools" },
    { id: "text",    label: "Text" },
    { id: "tint",    label: "Page colour" },
    { id: "hl",      label: "Highlighter" },
    { id: "draw",    label: "Draw / annotate" },
    { id: "notes",   label: "Sticky notes" }
  ];

  var ACTIONS = [];
  function add(group, id, label) { ACTIONS.push({ group: group, id: id, label: label }); }

  add("reading", "toggle-enabled",   "Reader Comfort on / off");
  add("reading", "enabled:on",       "Reader Comfort — on");
  add("reading", "enabled:off",      "Reader Comfort — off");
  add("reading", "ruler-toggle",     "Reading ruler on / off");
  add("reading", "ruler:on",         "Reading ruler — on");
  add("reading", "ruler:off",        "Reading ruler — off");
  add("reading", "ruler-bigger",     "Ruler — taller");
  add("reading", "ruler-smaller",    "Ruler — shorter");
  add("reading", "measure-toggle",   "Narrow column on / off");
  add("reading", "measure:narrow",   "Narrow column — on");
  add("reading", "measure:off",      "Narrow column — off");
  add("reading", "italics-toggle",   "Italics as bold on / off");
  add("reading", "italics:on",       "Italics as bold — on");
  add("reading", "italics:off",      "Italics as bold — off");
  add("reading", "underline-toggle", "Underline links on / off");
  add("reading", "underline:on",     "Underline links — on");
  add("reading", "underline:off",    "Underline links — off");
  add("reading", "motion-toggle",    "Reduce motion on / off");
  add("reading", "motion:on",        "Reduce motion — on");
  add("reading", "motion:off",       "Reduce motion — off");
  add("reading", "reset-all",        "Reset everything to defaults");

  add("text", "size-up",       "Text bigger");
  add("text", "size-down",     "Text smaller");
  add("text", "size-reset",    "Text size back to 100%");
  add("text", "leading-cycle", "Line spacing \u2014 next");
  add("text", "leading:off",    "Line spacing \u2014 off");
  add("text", "leading:tight",  "Line spacing \u2014 tight");
  add("text", "leading:normal", "Line spacing \u2014 normal");
  add("text", "leading:airy",   "Line spacing \u2014 airy");
  add("text", "spacing-cycle",  "Letter spacing \u2014 next");
  add("text", "spacing:off",    "Letter spacing \u2014 off");
  add("text", "spacing:normal", "Letter spacing \u2014 normal");
  add("text", "spacing:wide",   "Letter spacing \u2014 wide");
  add("text", "font-cycle",        "Font \u2014 next");
  add("text", "font:off",          "Font \u2014 the page's own");
  add("text", "font:atkinson",     "Font \u2014 Hyperlegible");
  add("text", "font:lexend",       "Font \u2014 Lexend");
  add("text", "font:opendyslexic", "Font \u2014 OpenDyslexic");
  add("text", "font:system",       "Font \u2014 Verdana");
  add("text", "font:mono",         "Font \u2014 Mono");

  add("tint", "tint-cycle", "Page colour \u2014 next");
  add("tint", "tint:off",   "Page colour \u2014 off");
  add("tint", "tint:cream", "Page colour \u2014 cream");
  add("tint", "tint:blue",  "Page colour \u2014 blue");
  add("tint", "tint:mint",  "Page colour \u2014 mint");
  add("tint", "tint:peach", "Page colour \u2014 peach");
  add("tint", "tint:dark",  "Page colour \u2014 dark");

  add("hl", "hl-toggle",       "Highlighter on / off");
  add("hl", "hl:on",           "Highlighter \u2014 on");
  add("hl", "hl:off",          "Highlighter \u2014 off");
  add("hl", "hl-quick-toggle", "Quick highlight mode on / off");
  add("hl", "hl-quick:on",     "Quick highlight mode \u2014 on");
  add("hl", "hl-quick:off",    "Quick highlight mode \u2014 off");
  add("hl", "hl-selection",    "Highlight what's selected");
  add("hl", "hl-color-cycle",  "Highlighter colour \u2014 next");
  add("hl", "hl-color:yellow", "Highlighter colour \u2014 yellow");
  add("hl", "hl-color:green",  "Highlighter colour \u2014 green");
  add("hl", "hl-color:pink",   "Highlighter colour \u2014 pink");
  add("hl", "hl-color:blue",   "Highlighter colour \u2014 blue");
  add("hl", "hl-copy",         "Copy every highlight on the page");
  add("hl", "hl-clear",        "Clear highlights on this page");

  add("draw", "draw-toggle",       "Draw mode on / off");
  add("draw", "draw:on",           "Draw mode \u2014 on");
  add("draw", "draw:off",          "Draw mode \u2014 off");
  add("draw", "draw-tool:pen",     "Draw tool \u2014 pen");
  add("draw", "draw-tool:eraser",  "Draw tool \u2014 eraser");
  add("draw", "draw-color:red",    "Pen colour \u2014 red");
  add("draw", "draw-color:orange", "Pen colour \u2014 orange");
  add("draw", "draw-color:yellow", "Pen colour \u2014 yellow");
  add("draw", "draw-color:green",  "Pen colour \u2014 green");
  add("draw", "draw-color:blue",   "Pen colour \u2014 blue");
  add("draw", "draw-width:s",      "Pen \u2014 thin");
  add("draw", "draw-width:m",      "Pen \u2014 medium");
  add("draw", "draw-width:l",      "Pen \u2014 thick");
  add("draw", "draw-undo",         "Undo the last stroke");
  add("draw", "draw-clear",        "Clear drawing on this page");

  add("notes", "note-add",           "Add a sticky note");
  add("notes", "note-color:yellow",  "Note colour \u2014 yellow");
  add("notes", "note-color:pink",    "Note colour \u2014 pink");
  add("notes", "note-color:blue",    "Note colour \u2014 blue");
  add("notes", "note-color:green",   "Note colour \u2014 green");
  add("notes", "notes-clear",        "Clear notes on this page");

  var BY_ID = {};
  ACTIONS.forEach(function (a) { BY_ID[a.id] = a; });

  function labelFor(id) { return BY_ID[id] ? BY_ID[id].label : id; }

  /* ---------- key chords ----------
   * Chords are built from `event.code`, not `event.key`: holding Alt rewrites
   * `key` into punctuation on macOS, and `code` is stable across that. The
   * editor records with this same function, so what you press is what matches.
   */

  var NAMED = {
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
    Space: "Space", Enter: "Enter", NumpadEnter: "Enter", Escape: "Esc", Tab: "Tab",
    Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    NumpadAdd: "Num+", NumpadSubtract: "Num-", NumpadMultiply: "Num*", NumpadDivide: "Num/"
  };

  var MOD_CODE = /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/;

  /* the printable/named part of a chord, or null while only modifiers are down */
  function keyName(e) {
    var c = e.code || "";
    if (MOD_CODE.test(c) || c === "CapsLock") return null;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return "Num" + c.slice(6);
    if (NAMED[c]) return NAMED[c];
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
    if (c) return c;
    /* virtual keyboards and a few remappers send no code at all */
    var k = e.key || "";
    if (!k || /^(Control|Alt|Shift|Meta|Dead|Unidentified)$/.test(k)) return null;
    return k.length === 1 ? k.toUpperCase() : k;
  }

  function chordFromEvent(e) {
    var k = keyName(e);
    if (!k) return null;
    var parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    parts.push(k);
    return parts.join("+");
  }

  /* the modifiers currently held, for the "Alt + …" preview while recording */
  function modifierPreview(e) {
    var parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    return parts;
  }

  var IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

  /* what to show the user — Alt is Option on a Mac, Meta is Command */
  function chordLabel(chord) {
    if (!chord) return "";
    return chord.split("+").map(function (p) {
      if (p === "Meta") return IS_MAC ? "Cmd" : "Win";
      if (p === "Alt" && IS_MAC) return "Option";
      return p;
    }).join(" + ");
  }

  /* Chords the browser itself owns. Binding these would either do nothing or
     break something the user relies on, so the editor refuses them outright. */
  var RESERVED = [
    "Ctrl+T", "Ctrl+N", "Ctrl+W", "Ctrl+Q", "Ctrl+L", "Ctrl+R", "Ctrl+P", "Ctrl+S",
    "Ctrl+O", "Ctrl+J", "Ctrl+H", "Ctrl+D", "Ctrl+F", "Ctrl+A", "Ctrl+C", "Ctrl+V",
    "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+Tab", "Ctrl+PageUp", "Ctrl+PageDown",
    "Ctrl+Shift+T", "Ctrl+Shift+N", "Ctrl+Shift+W", "Ctrl+Shift+Q", "Ctrl+Shift+P",
    "Ctrl+Shift+Tab", "Ctrl+Shift+Delete", "Ctrl+Shift+I", "Ctrl+Shift+J",
    "Alt+F4", "Alt+Tab", "Alt+Left", "Alt+Right", "Alt+Home", "Alt+Esc",
    "F5", "F6", "F11", "F12", "Esc", "Tab", "Enter", "Space"
  ];

  /* Is this chord safe and sensible to bind? Returns a level the editor paints:
     "error" refuses it, "warn" allows it with a caution, null is clean. */
  function validateChord(chord) {
    if (!chord) return { level: "error", message: "Press a key combination." };
    if (RESERVED.indexOf(chord) >= 0) {
      return { level: "error", message: chordLabel(chord) + " belongs to the browser. Pick another." };
    }
    var parts = chord.split("+");
    var key = parts[parts.length - 1];
    var hasHardMod = parts.indexOf("Ctrl") >= 0 || parts.indexOf("Alt") >= 0 || parts.indexOf("Meta") >= 0;
    if (!hasHardMod) {
      return {
        level: "error",
        message: "Add Ctrl, Alt" + (IS_MAC ? " (Option)" : "") + " or " + (IS_MAC ? "Cmd" : "Win") +
                 " — a bare key would fire while you were typing on the page."
      };
    }
    if (parts.indexOf("Meta") >= 0) {
      return { level: "warn", message: (IS_MAC ? "Cmd" : "Windows key") + " shortcuts are often taken by the operating system." };
    }
    if (parts.indexOf("Ctrl") >= 0) {
      return { level: "warn", message: "Ctrl shortcuts often clash with the page or the browser. Alt is usually safer." };
    }
    if (key === "Backspace" || key === "Delete") {
      return { level: "warn", message: "Fine here, but easy to hit by accident." };
    }
    return { level: null, message: "" };
  }

  /* ---------- ready-made macros the editor offers as one-click adds ---------- */

  var SUGGESTIONS = [
    { name: "Night reading",  chord: "Alt+Shift+N", actions: ["tint:dark", "font:atkinson", "leading:normal"] },
    { name: "Focus mode",     chord: "Alt+Shift+F", actions: ["measure:narrow", "ruler:on", "motion:on"] },
    { name: "Dyslexia setup", chord: "Alt+Shift+D", actions: ["font:opendyslexic", "spacing:wide", "leading:airy", "italics:on"] },
    { name: "Bigger text",    chord: "Alt+Shift+=", actions: ["size-up"] },
    { name: "Smaller text",   chord: "Alt+Shift+-", actions: ["size-down"] },
    { name: "Highlight in green", chord: "Alt+Shift+G", actions: ["hl-color:green", "hl-selection"] },
    { name: "Wipe this page", chord: "Alt+Shift+Backspace", actions: ["hl-clear", "draw-clear", "notes-clear"] },
    { name: "Back to normal", chord: "Alt+Shift+0", actions: ["reset-all"] }
  ];

  scope.RC_ACTIONS = {
    GROUPS: GROUPS,
    ACTIONS: ACTIONS,
    SUGGESTIONS: SUGGESTIONS,
    labelFor: labelFor,
    keyName: keyName,
    chordFromEvent: chordFromEvent,
    modifierPreview: modifierPreview,
    chordLabel: chordLabel,
    validateChord: validateChord,
    isMac: IS_MAC
  };
})(typeof window !== "undefined" ? window : this);
