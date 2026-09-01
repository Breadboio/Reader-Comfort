/* Reader Comfort — service worker
 * Relays keyboard-shortcut commands to the active tab's content script.
 */
chrome.commands.onCommand.addListener(function (command) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "rc:command", command: command }, function () {
      void chrome.runtime.lastError; // ignore tabs with no content script (chrome://, store)
    });
  });
});
