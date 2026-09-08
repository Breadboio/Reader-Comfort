/* Reader Comfort — content script
 * Applies page tint, text size, line spacing, accessible fonts and a
 * reading ruler to any page. Ported from the reading system baked into
 * breadtoasting.com/fortigate-study-guide.
 */
(function () {
  "use strict";

  var ORIGIN = location.origin;
  var root = document.documentElement;

  var DEFAULTS = {
    enabled: true,
    tint: "off",        // off | cream | blue | mint | peach | dark
    size: 100,          // percent, 80..220 (scales the page's root font-size)
    leading: "off",     // off | tight | normal | airy
    spacing: "off",     // off | normal | wide  (letter + word spacing)
    font: "off",        // off | atkinson | lexend | opendyslexic | system | mono
    measure: "off",     // off | narrow  (cap line length on the main column)
    ruler: false,
    rulerHeight: 130,
    rulerDblclick: true, // triple-click the page toggles the ruler
    rulerWheel: true,          // modifier + mouse wheel changes the ruler's height
    rulerWheelMod: "alt-shift",
    killItalics: false, // render <em>/<i> as bold instead of slanted
    linkUnderline: false,
    reduceMotion: false
  };

  var TINTS = {
    cream: { bg: "#FAF3E3", ink: "#2B2721", dim: "rgba(43,39,33,.32)", memo: "#8A6100" },
    blue:  { bg: "#E7F0F7", ink: "#1E2C36", dim: "rgba(30,44,54,.32)", memo: "#8A6100" },
    mint:  { bg: "#E8F2EA", ink: "#1F2E24", dim: "rgba(31,46,36,.32)", memo: "#8A6100" },
    peach: { bg: "#FBEDE5", ink: "#33251E", dim: "rgba(51,37,30,.32)", memo: "#8A6100" },
    dark:  { bg: "#1C2026", ink: "#E4E8EE", dim: "rgba(0,0,0,.45)",    memo: "#F3C566" }
  };

  var LEADING = { tight: "1.5", normal: "1.85", airy: "2.35" };
  var SPACING = {
    normal: { letter: "0.012em", word: "0.06em" },
    wide:   { letter: "0.045em", word: "0.16em" }
  };

  var FONT_STACKS = {
    atkinson:     "'RC Atkinson Hyperlegible', Verdana, 'Segoe UI', system-ui, sans-serif",
    lexend:       "'RC Lexend', 'Segoe UI', system-ui, sans-serif",
    opendyslexic: "'RC OpenDyslexic', Comic Sans MS, Verdana, sans-serif",
    system:       "Verdana, 'Segoe UI', system-ui, sans-serif",
    mono:         "ui-monospace, 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace"
  };

  /* Text elements we are willing to restyle. Deliberately excludes
     code, icon fonts and form controls that rely on their own metrics. */
  var TEXT_SEL = "p,li,dd,dt,blockquote,h1,h2,h3,h4,h5,h6,a,span,em,i,b,strong,small," +
                 "label,td,th,caption,figcaption,summary,article,section,aside,main,header,footer,div";
  var TEXT_NOT = ":not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *)" +
                 ':not([class*="icon" i]):not([class*="fa-"]):not([class*="material-icons"])' +
                 ':not([aria-hidden="true"])';
  var FONT_SCOPE = TEXT_SEL.split(",").map(function (t) { return t + TEXT_NOT; }).join(",");

  var current = Object.assign({}, DEFAULTS);
  var dynStyleEl = null, ruler = null;
  var mouseWired = false, lastPushedCss = null;

  /* ---------- style plumbing ----------
   * Static CSS (fonts, ruler, all the tool chrome) ships in reader.css, which
   * the manifest injects — that path is exempt from the page's CSP. The
   * per-setting rules below are volatile, so we push them two ways:
   *   1. a <style id="rc-dynamic"> element (instant, but Firefox blocks it on
   *      strict-CSP pages), and
   *   2. chrome.scripting.insertCSS from the background (survives CSP).
   */

  function buildDynamicCss(s) {
    var css = [];

    if (s.tint !== "off" && TINTS[s.tint]) {
      var t = TINTS[s.tint];
      root.style.setProperty("--rc-dim", t.dim);
      root.style.setProperty("--rc-memo", t.memo);
      css.push("html[data-rc-tint]{background:" + t.bg + " !important}");
      css.push("html[data-rc-tint] body{background:" + t.bg + " !important;color:" + t.ink + " !important}");
      /* common opaque content wrappers, so the wash reaches the column too */
      css.push("html[data-rc-tint] :is(main,article,[role='main'],.content,.main,.post,.article," +
        ".markdown-body,.doc-content,.page,.container,.entry-content,#content,#main){" +
        "background-color:" + t.bg + " !important;color:" + t.ink + " !important}");
      if (s.tint === "dark") {
        css.push("html[data-rc-tint='dark'] :is(p,li,dd,dt,blockquote,h1,h2,h3,h4,h5,h6,span,td,th)" +
          TEXT_NOT + "{color:" + t.ink + " !important}");
        css.push("html[data-rc-tint='dark'] :is(pre,code,kbd,samp){" +
          "background-color:#12161B !important;color:#E8EDF4 !important;border-color:#3A424D !important}");
        css.push("html[data-rc-tint='dark'] img,html[data-rc-tint='dark'] video,html[data-rc-tint='dark'] picture{" +
          "filter:brightness(.85)}");
      }
    } else {
      root.style.removeProperty("--rc-dim");
      root.style.removeProperty("--rc-memo");
    }

    if (s.size !== 100) {
      css.push("html{font-size:" + (16 * s.size / 100).toFixed(2) + "px !important}");
    }

    if (s.leading !== "off" && LEADING[s.leading]) {
      css.push("html body " + FONT_SCOPE + "{line-height:" + LEADING[s.leading] + " !important}");
    }

    if (s.spacing !== "off" && SPACING[s.spacing]) {
      var sp = SPACING[s.spacing];
      css.push("html body " + FONT_SCOPE +
        "{letter-spacing:" + sp.letter + " !important;word-spacing:" + sp.word + " !important}");
    }

    if (s.font !== "off" && FONT_STACKS[s.font]) {
      css.push("html body " + FONT_SCOPE + "{font-family:" + FONT_STACKS[s.font] + " !important}");
    }

    if (s.measure === "narrow") {
      css.push("html[data-rc-measure='narrow'] :is(main,article,[role='main'],.content,.markdown-body," +
        ".entry-content,.post-content,.doc-content,.article-body,#content,#main){max-width:70ch !important;" +
        "margin-left:auto !important;margin-right:auto !important}");
      css.push("html[data-rc-measure='narrow'] body :is(p,li,blockquote,h1,h2,h3,h4)" + TEXT_NOT +
        "{max-width:66ch !important}");
    }

    if (s.killItalics) {
      css.push("html body :is(em,i)" + TEXT_NOT + "{font-style:normal !important;font-weight:700 !important}");
    }

    if (s.linkUnderline) {
      css.push("html body a" + TEXT_NOT + "{text-decoration:underline !important;" +
        "text-underline-offset:3px;text-decoration-thickness:2px}");
    }

    if (s.reduceMotion) {
      css.push("*,*::before,*::after{animation-duration:.001ms !important;" +
        "animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}");
    }

    if (s.ruler) {
      css.push("#rc-ruler{height:" + Math.max(40, Math.min(400, s.rulerHeight)) + "px}");
    }

    return css.join("\n");
  }

  function applyAttrs(s) {
    var on = s.enabled;
    setAttr("data-rc-off", on ? null : "");
    setAttr("data-rc-tint", on && s.tint !== "off" ? s.tint : null);
    setAttr("data-rc-measure", on && s.measure !== "off" ? s.measure : null);
    setAttr("data-rc-ruler", on && s.ruler ? "on" : null);
  }

  /* only touch the DOM when the value actually changes, so our own writes
     don't wake the MutationObserver below */
  function setAttr(name, val) {
    if (val == null) {
      if (root.hasAttribute(name)) root.removeAttribute(name);
    } else if (root.getAttribute(name) !== val) {
      root.setAttribute(name, val);
    }
  }

  function apply(s) {
    current = s;
    var css = s.enabled ? buildDynamicCss(s) : "";
    applyAttrs(s);
    pushCss(css);
    ensureRuler();
    /* the wheel gesture sets an inline height for instant feedback; once the
       value is in the stylesheet, drop it so the popup's slider isn't shadowed */
    if (ruler) ruler.style.height = "";
    if (s.enabled && s.ruler) wireMouse();
  }

  function pushCss(css) {
    if (css === lastPushedCss) return;
    lastPushedCss = css;
    // fast path: a <style> element (blocked on strict-CSP Firefox pages)
    if (!dynStyleEl || !dynStyleEl.isConnected) {
      dynStyleEl = document.createElement("style");
      dynStyleEl.id = "rc-dynamic";
      (document.head || root).appendChild(dynStyleEl);
    }
    dynStyleEl.textContent = css;
    pushCssToBackground(css);
  }

  /* The background injection is the CSP-proof path, but it is a round trip and
     an Alt+wheel gesture or a macro can rewrite the CSS dozens of times a
     second. Send the first change straight through, then trail the rest. */
  var bgT = null, bgPending = null, bgLast = 0;

  function pushCssToBackground(css) {
    var now = Date.now();
    if (now - bgLast > 150) { bgLast = now; sendCss(css); return; }
    bgPending = css;
    if (bgT) return;
    bgT = setTimeout(function () {
      bgT = null; bgLast = Date.now();
      sendCss(bgPending);
    }, 150);
  }

  function sendCss(css) {
    try {
      chrome.runtime.sendMessage({ type: "rc:css", css: css }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  /* ---------- ruler ---------- */

  function ensureRuler() {
    if (ruler && ruler.isConnected) return;
    if (!document.body) return;
    ruler = document.getElementById("rc-ruler");
    if (!ruler) {
      ruler = document.createElement("div");
      ruler.id = "rc-ruler";
      ruler.setAttribute("aria-hidden", "true");
    }
    document.body.appendChild(ruler);
  }

  function wireMouse() {
    if (mouseWired) return;
    mouseWired = true;
    document.addEventListener("mousemove", function (e) {
      if (!current.enabled || !current.ruler || !ruler) return;
      var h = ruler.offsetHeight || current.rulerHeight;
      ruler.style.top = Math.max(0, e.clientY - h / 2) + "px";
    }, { passive: true });
  }

  /* ---------- ruler height: modifier + wheel, and the keyboard actions ----------
   *
   * Which modifier is a setting, because every candidate is spoken for
   * somewhere. Chrome leaves plain Alt+wheel alone, but Firefox binds it to
   * history back/forward by default (mousewheel.with_alt.action), and a lot of
   * Linux window managers grab Alt+scroll for opacity or volume before the
   * browser ever sees it -- preventDefault cannot win an argument it is never
   * told about. Alt+Shift is the default here because it is claimed least
   * often; anyone whose desktop disagrees can pick another, or turn the
   * gesture off and bind ruler-bigger / ruler-smaller to a key instead.
   */

  var RULER_MIN = 40, RULER_MAX = 400;
  var rulerPersistT = null, sizeTagT = null;

  var WHEEL_MODS = {
    "alt":       function (e) { return e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey; },
    "alt-shift": function (e) { return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey; },
    "ctrl-alt":  function (e) { return e.altKey && e.ctrlKey && !e.shiftKey && !e.metaKey; }
  };

  function clampRuler(v) { return Math.max(RULER_MIN, Math.min(RULER_MAX, Math.round(v))); }

  document.addEventListener("wheel", function (e) {
    if (!current.enabled || !current.ruler || current.rulerWheel === false) return;
    var match = WHEEL_MODS[current.rulerWheelMod] || WHEEL_MODS["alt-shift"];
    if (!match(e)) return;
    ensureRuler();
    if (!ruler) return;

    /* the modifier combinations all have a default action of their own
       somewhere -- horizontal scroll, zoom, history -- so cancel it */
    e.preventDefault();

    /* deltaY is roughly 100 a notch on a mouse and a handful of pixels on a
       trackpad, so scale rather than count notches; the cap stops a flung
       trackpad from crossing the whole range in a single event. */
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;         // lines
    else if (e.deltaMode === 2) d *= 400;   // pages
    d = Math.max(-120, Math.min(120, d));

    var h = clampRuler(current.rulerHeight - d * 0.25);
    if (h === current.rulerHeight) return;

    current.rulerHeight = h;
    ruler.style.height = h + "px";          // instant; apply() clears it later
    showRulerSize(h);

    clearTimeout(rulerPersistT);
    rulerPersistT = setTimeout(function () { persistPatch({ rulerHeight: h }); }, 260);
  }, { passive: false, capture: true });

  function nudgeRuler(delta) {
    var h = clampRuler(current.rulerHeight + delta);
    if (h === current.rulerHeight) return;
    persistPatch({ rulerHeight: h });
    showRulerSize(h);
  }

  /* a readout inside the ruler itself, so the size is a number and not a guess */
  function showRulerSize(h) {
    if (!ruler) return;
    ruler.setAttribute("data-size", h + "px");
    ruler.setAttribute("data-sizing", "");
    clearTimeout(sizeTagT);
    sizeTagT = setTimeout(function () {
      if (ruler) ruler.removeAttribute("data-sizing");
    }, 900);
  }

  /* ---------- storage ---------- */

  function computeEffective(store) {
    var g = Object.assign({}, DEFAULTS, store.global || {});
    var override = (store.sites || {})[ORIGIN];
    return override ? Object.assign(g, override) : g;
  }

  function load() {
    chrome.storage.sync.get(["global", "sites"], function (store) {
      apply(computeEffective(store || {}));
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    if (!("global" in changes) && !("sites" in changes)) return;
    chrome.storage.sync.get(["global", "sites"], function (store) {
      apply(computeEffective(store || {}));
    });
  });

  /* ---------- actions ----------
   * The vocabulary shared with macros.js and the settings page. Ids are
   * either a verb ("size-up") or a verb and a value ("tint:dark"); anything
   * this module does not own belongs to the highlighter, draw or notes
   * script and falls through here untouched.
   */

  var ORDER = {
    tint:    ["off", "cream", "blue", "mint", "peach", "dark"],
    leading: ["off", "tight", "normal", "airy"],
    spacing: ["off", "normal", "wide"],
    font:    ["off", "atkinson", "lexend", "opendyslexic", "system", "mono"],
    measure: ["off", "narrow"]
  };

  function nextIn(list, value) {
    var i = list.indexOf(value);
    return list[(i + 1) % list.length];
  }

  function clampSize(v) { return Math.max(80, Math.min(220, v)); }

  function doAction(id) {
    if (typeof id !== "string") return;
    var value = null, c = id.indexOf(":");
    if (c > 0) { value = id.slice(c + 1); id = id.slice(0, c); }

    switch (id) {
      case "toggle-enabled":   persistPatch({ enabled: !current.enabled }); break;
      case "enabled":          persistPatch({ enabled: value === "on" }); break;

      case "ruler-toggle":     persistPatch({ ruler: !current.ruler }); break;
      case "ruler":            persistPatch({ ruler: value === "on" }); break;
      case "ruler-bigger":     nudgeRuler(20); break;
      case "ruler-smaller":    nudgeRuler(-20); break;

      case "measure-toggle":   persistPatch({ measure: current.measure === "narrow" ? "off" : "narrow" }); break;
      case "italics-toggle":   persistPatch({ killItalics: !current.killItalics }); break;
      case "italics":          persistPatch({ killItalics: value === "on" }); break;
      case "underline-toggle": persistPatch({ linkUnderline: !current.linkUnderline }); break;
      case "underline":        persistPatch({ linkUnderline: value === "on" }); break;
      case "motion-toggle":    persistPatch({ reduceMotion: !current.reduceMotion }); break;
      case "motion":           persistPatch({ reduceMotion: value === "on" }); break;

      case "size-up":          persistPatch({ size: clampSize(current.size + 10) }); break;
      case "size-down":        persistPatch({ size: clampSize(current.size - 10) }); break;
      case "size-reset":       persistPatch({ size: 100 }); break;

      case "tint": case "leading": case "spacing": case "font": case "measure":
        if (ORDER[id].indexOf(value) >= 0) {
          var patch = {}; patch[id] = value; persistPatch(patch);
        }
        break;

      case "tint-cycle":       persistPatch({ tint: nextIn(ORDER.tint, current.tint) }); break;
      case "leading-cycle":    persistPatch({ leading: nextIn(ORDER.leading, current.leading) }); break;
      case "spacing-cycle":    persistPatch({ spacing: nextIn(ORDER.spacing, current.spacing) }); break;
      case "font-cycle":       persistPatch({ font: nextIn(ORDER.font, current.font) }); break;

      case "reset-all":        persistPatch(Object.assign({}, DEFAULTS)); break;
    }
  }

  /* ---------- messaging (popup + keyboard commands) ---------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "rc:getState") {
      chrome.storage.sync.get(["global", "sites"], function (store) {
        store = store || {};
        sendResponse({
          origin: ORIGIN,
          effective: computeEffective(store),
          global: Object.assign({}, DEFAULTS, store.global || {}),
          hasOverride: !!(store.sites || {})[ORIGIN],
          defaults: DEFAULTS
        });
      });
      return true;
    }
    if (msg && msg.type === "rc:previewApply") {
      apply(Object.assign({}, DEFAULTS, msg.settings || {}));
    }
    if (msg && msg.type === "rc:command") {
      if (msg.command === "toggle-ruler") persistPatch({ ruler: !current.ruler });
      if (msg.command === "toggle-enabled") persistPatch({ enabled: !current.enabled });
    }
    if (msg && msg.type === "rc:action") doAction(msg.action);
    if (msg && msg.type === "rc:actions" && Array.isArray(msg.actions)) msg.actions.forEach(doAction);
  });

  /* Write a partial settings change to whichever layer governs this origin.
     The change lands on screen immediately and the storage write is coalesced:
     a macro fires several patches in a row and the wheel gesture fires dozens,
     and a plain read-modify-write per patch would both lose steps to the race
     between them and chew through storage.sync's write quota. */
  var pendingPatch = null, patchT = null;

  function persistPatch(patch) {
    current = Object.assign({}, current, patch);
    apply(current);
    pendingPatch = Object.assign(pendingPatch || {}, patch);
    clearTimeout(patchT);
    patchT = setTimeout(flushPatch, 80);
  }

  function flushPatch() {
    var patch = pendingPatch;
    pendingPatch = null;
    if (!patch) return;
    chrome.storage.sync.get(["global", "sites"], function (store) {
      store = store || {};
      var sites = store.sites || {};
      if (sites[ORIGIN]) {
        sites[ORIGIN] = Object.assign({}, sites[ORIGIN], patch);
        chrome.storage.sync.set({ sites: sites });
      } else {
        chrome.storage.sync.set({ global: Object.assign({}, DEFAULTS, store.global || {}, patch) });
      }
    });
  }

  /* ---------- triple-click the page toggles the ruler ----------
   * `rulerDblclick` is the (legacy-named) setting flag; the gesture is a
   * triple-click — click.detail === 3 on the third of a fast click burst. */

  var IGNORE_CLICK = "input,textarea,select,button,a,[contenteditable=''],[contenteditable='true']," +
    "[role='button'],[role='textbox'],[role='link'],[role='menuitem'],video,audio";
  document.addEventListener("click", function (e) {
    if (e.detail !== 3) return;
    if (!current.enabled || !current.rulerDblclick) return;
    if (e.target && e.target.closest && e.target.closest(IGNORE_CLICK)) return;
    persistPatch({ ruler: !current.ruler });
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  });

  /* ---------- resilience: some SPAs wipe <html> attributes / our nodes ---------- */

  var reassertT = null;
  function reassert() {
    clearTimeout(reassertT);
    reassertT = setTimeout(function () {
      applyAttrs(current);
      if (dynStyleEl && !dynStyleEl.isConnected) { dynStyleEl = null; }
      if (current.enabled) { pushCss(current.enabled ? buildDynamicCss(current) : ""); }
      ensureRuler();
    }, 200);
  }

  var attrObs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var name = muts[i].attributeName || "";
      if (name.indexOf("data-rc-") === 0) { reassert(); return; }
    }
  });
  try {
    attrObs.observe(root, { attributes: true, attributeFilter: ["data-rc-tint", "data-rc-measure", "data-rc-ruler", "data-rc-off"] });
  } catch (e) {}

  /* ---------- boot ---------- */

  load();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      ensureRuler();
      apply(current);
    });
  } else {
    ensureRuler();
  }
})();
