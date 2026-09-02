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
