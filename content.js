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
    rulerDblclick: true, // double-click the page toggles the ruler
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
    // CSP-proof path: let the background inject it via chrome.scripting
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
  });

  /* write a partial settings change to whichever layer governs this origin */
  function persistPatch(patch) {
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
    current.ruler = !current.ruler;
    apply(current);                 // instant, don't wait for the storage round-trip
    persistPatch({ ruler: current.ruler });
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
