/* Reader Comfort — background (service worker on Chrome, event page on Firefox)
 *  - relays keyboard-shortcut commands to the active tab
 *  - injects the content script's per-setting CSS via chrome.scripting so it
 *    survives strict-CSP pages (a content-script <style> does not, on Firefox)
 */

chrome.commands.onCommand.addListener(function (command) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "rc:command", command: command }, function () {
      void chrome.runtime.lastError;
    });
  });
});

/* tabId -> last CSS string we inserted, so we can removeCSS before re-inserting */
var lastCss = {};

function frameTarget(sender) {
  var t = { tabId: sender.tab.id };
  if (typeof sender.frameId === "number") t.frameIds = [sender.frameId];
  return t;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "rc:css" || !sender.tab || !sender.tab.id) return;
  if (!chrome.scripting || !chrome.scripting.insertCSS) { sendResponse({ ok: false }); return; }

  var tabId = sender.tab.id;
  var target = frameTarget(sender);
  var prev = lastCss[tabId];
  var next = msg.css || "";

  var done = function () {
    if (!next) { delete lastCss[tabId]; sendResponse({ ok: true }); return; }
    chrome.scripting.insertCSS({ target: target, css: next })
      .then(function () { lastCss[tabId] = next; sendResponse({ ok: true }); })
      .catch(function (e) { sendResponse({ ok: false, error: String(e) }); });
  };

  if (prev) {
    chrome.scripting.removeCSS({ target: target, css: prev }).then(done, done);
  } else {
    done();
  }
  return true; // async sendResponse
});

chrome.tabs.onRemoved.addListener(function (tabId) { delete lastCss[tabId]; });
chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.status === "loading") delete lastCss[tabId]; // navigation drops injected CSS
});

/* ---------- custom shortcuts and macros ----------
 * macros.js lives in the page and cannot reach chrome.tabs or chrome.commands,
 * so the background does two small jobs for it: bounce an action list back
 * into the tab it came from (a content script cannot message its siblings
 * directly), and report which chords the browser's own commands already own.
 */

var CMD_KEY = {
  Command: "Meta", MacCtrl: "Ctrl", Comma: ",", Period: ".",
  Up: "Up", Down: "Down", Left: "Left", Right: "Right"
};
var MOD_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];

/* Chrome writes shortcuts as "Ctrl+Shift+Y"; actions.js builds them in a fixed
   modifier order with its own key names. Bring the first into the second. */
function normalizeCommandShortcut(shortcut) {
  if (!shortcut) return null;
  var parts = shortcut.split("+").map(function (p) {
    p = p.trim();
    return CMD_KEY[p] || p;
  });
  var mods = [], key = null;
  parts.forEach(function (p) {
    if (MOD_ORDER.indexOf(p) >= 0) { if (mods.indexOf(p) < 0) mods.push(p); }
    else key = p;
  });
  if (!key) return null;
  mods.sort(function (a, b) { return MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b); });
  return mods.concat([key]).join("+");
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === "rc:relay" && msg.msg && sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, msg.msg, function () {
      void chrome.runtime.lastError;
    });
    return;
  }

  if (msg.type === "rc:getCommandChords") {
    if (!chrome.commands || !chrome.commands.getAll) { sendResponse({ chords: [] }); return; }
    chrome.commands.getAll(function (cmds) {
      var chords = [];
      (cmds || []).forEach(function (c) {
        var n = normalizeCommandShortcut(c && c.shortcut);
        if (n && chords.indexOf(n) < 0) chords.push(n);
      });
      sendResponse({ chords: chords });
    });
    return true; // async sendResponse
  }
});
