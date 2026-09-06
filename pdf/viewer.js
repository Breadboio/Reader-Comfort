/* Reader Comfort — PDF viewer
 *
 * Chrome's built-in PDF viewer is a plugin: content scripts can't reach inside
 * it, so none of the reading tools work on a PDF. This renders the PDF in a
 * normal extension page instead, which the tools treat like any other page.
 *
 * Two modes:
 *   Page view     canvas render + PDF.js text layer. Looks like the PDF, and
 *                 the invisible text layer makes selection (so highlighting)
 *                 work.
 *   Reading view  the text pulled out and reflowed as ordinary paragraphs, so
 *                 font, size, spacing and line width actually apply — the
 *                 thing a fixed PDF layout otherwise makes impossible.
 */
import * as pdfjsLib from "./pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf/pdf.worker.mjs");

var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
var fileUrl = params.get("file") || "";

var doc = null;
var scale = 1.25;
var mode = "page";              // "page" | "reader"
var renderToken = 0;            // bumps to abandon an in-flight render
var pageObserver = null;        // decides which pages are worth holding in memory
var placeholders = [];          // one sized box per page, index 0 == page 1
var MAX_RATIO = 2;              // cap the backing store on very high-DPI screens

/* ---------- boot ---------- */

if (!fileUrl) {
  fail("No PDF was given to open.");
} else {
  document.title = fileName(fileUrl) + " — Reader Comfort";
  $("rcp-title").textContent = fileName(fileUrl);
  load();
}

function fileName(u) {
  try {
    var p = new URL(u).pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(p || u);
  } catch (e) { return u; }
}

function fail(msg, detail) {
  var s = $("rcp-status");
  s.hidden = false;
  s.textContent = msg;
  if (detail) {
    var p = document.createElement("p");
    p.style.cssText = "margin-top:10px;font-size:12px;opacity:.8";
    p.textContent = detail;
    s.appendChild(p);
  }
  if (fileUrl) {
    var a = document.createElement("p");
    a.style.marginTop = "12px";
    var link = document.createElement("a");
    link.href = fileUrl;
    link.textContent = "Open the original PDF instead";
    a.appendChild(link);
    s.appendChild(a);
  }
  $("rcp-pages").hidden = true;
  $("rcp-reader").hidden = true;
}

async function load() {
  try {
    // isEvalSupported:false keeps PDF.js off the one code path MV3's CSP bans
    doc = await pdfjsLib.getDocument({
      url: fileUrl,
      isEvalSupported: false,
      // let the fetch carry the user's cookies for a PDF behind a login
      withCredentials: true
    }).promise;
  } catch (e) {
    var msg = String((e && e.message) || e);
    if (/Missing PDF|Unexpected server response|fetch/i.test(msg)) {
      fail("That PDF couldn't be fetched.",
        "It may need a sign-in the viewer doesn't share, or the site may block " +
        "other pages from loading it. " + msg);
    } else if (/password/i.test(msg)) {
      fail("That PDF is password-protected.", msg);
    } else {
      fail("That PDF couldn't be opened.", msg);
    }
    return;
  }
  $("rcp-count").textContent = doc.numPages + (doc.numPages === 1 ? " page" : " pages");
  $("rcp-status").hidden = true;
  render();
}

/* ---------- rendering ---------- */

/* Page view renders lazily, and this is not an optimisation — it is the
 * difference between working and not. Rendering every page up front allocates
 * a full canvas backing store per page: a 400-page PDF measured at 4.6 GB and
 * took 40s to settle, which on a 4GB Chromebook means the tab is killed.
 * Instead every page gets a correctly-sized empty box immediately (so the
 * scrollbar is honest from the start), and only pages near the viewport carry
 * a canvas. Pages that scroll well clear of it give theirs back. */

async function render() {
  var token = ++renderToken;
  if (mode === "reader") {
    teardownPages();
    $("rcp-pages").hidden = true;
    $("rcp-reader").hidden = false;
    await renderReader(token);
  } else {
    $("rcp-reader").hidden = true;
    $("rcp-pages").hidden = false;
    await renderPages(token);
  }
}

function teardownPages() {
  if (pageObserver) { pageObserver.disconnect(); pageObserver = null; }
  placeholders.forEach(freePage);
  placeholders = [];
  $("rcp-pages").textContent = "";
}

async function renderPages(token) {
  teardownPages();
  var host = $("rcp-pages");

  // Page 1's size sets every placeholder. A PDF with mixed page sizes corrects
  // each box as it renders; guessing beats blocking on doc.numPages getPage()s.
  var first = await doc.getPage(1);
  if (token !== renderToken) return;
  var base = first.getViewport({ scale: scale });

  for (var n = 1; n <= doc.numPages; n++) {
    var wrap = document.createElement("div");
    wrap.className = "rcp-page";
    wrap.dataset.page = String(n);
    wrap.style.width = Math.floor(base.width) + "px";
    wrap.style.height = Math.floor(base.height) + "px";
    var label = document.createElement("span");
    label.className = "rcp-pagenum";
    label.textContent = String(n);
    wrap.appendChild(label);
    host.appendChild(wrap);
    placeholders.push(wrap);
  }

  // Three viewports of lead either way. Enough that a fast fling rarely
  // outruns the renderer, cheap enough that only a handful of pages are ever
  // live -- measured at ~7 canvases / ~80MB on a 400-page document, against
  // 400 canvases / 4.6GB when every page rendered up front.
  pageObserver = new IntersectionObserver(function (entries) {
    if (token !== renderToken) return;
    entries.forEach(function (e) {
      if (e.isIntersecting) renderPage(e.target, token);
      else freePage(e.target);
    });
  }, { root: null, rootMargin: "300% 0px" });

  placeholders.forEach(function (w) { pageObserver.observe(w); });
}

async function renderPage(wrap, token) {
  if (wrap._state) return;                 // already rendered, or on its way
  wrap._state = "busy";
  var n = +wrap.dataset.page;
  try {
    var page = await doc.getPage(n);
    if (token !== renderToken || wrap._state !== "busy") { wrap._state = null; return; }
    var viewport = page.getViewport({ scale: scale });
    wrap.style.width = Math.floor(viewport.width) + "px";
    wrap.style.height = Math.floor(viewport.height) + "px";

    var canvas = document.createElement("canvas");
    var ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = Math.floor(viewport.width) + "px";
    canvas.style.height = Math.floor(viewport.height) + "px";

    var ctx = canvas.getContext("2d", { alpha: false });
    ctx.scale(ratio, ratio);
    var task = page.render({ canvasContext: ctx, viewport: viewport, canvas: canvas });
    wrap._task = task;
    await task.promise;
    wrap._task = null;
    if (token !== renderToken || wrap._state !== "busy") { wrap._state = null; return; }
    wrap.appendChild(canvas);

    var textDiv = document.createElement("div");
    textDiv.className = "textLayer";
    textDiv.style.setProperty("--total-scale-factor", String(scale));
    wrap.appendChild(textDiv);
    try {
      var tl = new pdfjsLib.TextLayer({
        textContentSource: await page.getTextContent(),
        container: textDiv,
        viewport: viewport
      });
      await tl.render();
    } catch (e) {
      // a page without extractable text just isn't selectable; not fatal
    }
    if (token !== renderToken || wrap._state !== "busy") { wrap._state = null; return; }
    wrap._state = "done";
    contentChanged();
  } catch (e) {
    // a cancelled render lands here too; leave the box for the next pass
    wrap._state = null;
  }
}

/* Give back the expensive parts, keep the box so the scroll height holds. */
function freePage(wrap) {
  if (wrap._task) {
    try { wrap._task.cancel(); } catch (e) {}
    wrap._task = null;
  }
  if (!wrap._state) return;
  wrap._state = null;
  var canvas = wrap.querySelector("canvas");
  // zeroing the dimensions releases the backing store now rather than whenever
  // the collector next runs — the whole point of the exercise
  if (canvas) { canvas.width = 0; canvas.height = 0; }
  var label = wrap.querySelector(".rcp-pagenum");
  wrap.textContent = "";
  if (label) wrap.appendChild(label);
}

/* The highlighter anchors into whatever text is in the DOM. Lazily rendered
 * pages and progressively appended reader text are both content it never saw,
 * so tell it to have another go. Debounced: a scroll can land several pages. */
var changeTimer = null;
function contentChanged() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(function () {
    window.dispatchEvent(new Event("rc:content-changed"));
  }, 250);
}

/* Reader mode is text-only, so memory is not the problem here — latency is.
 * Append each page as its text arrives and yield, so a long PDF is readable
 * from the top while the rest is still being pulled. */
async function renderReader(token) {
  var host = $("rcp-doc");
  host.textContent = "";
  for (var n = 1; n <= doc.numPages; n++) {
    if (token !== renderToken) return;
    var page = await doc.getPage(n);
    var content = await page.getTextContent();
    if (token !== renderToken) return;

    if (n > 1) {
      var hr = document.createElement("hr");
      hr.className = "rcp-pagebreak";
      hr.setAttribute("data-page", String(n));
      host.appendChild(hr);
    }
    paragraphs(content).forEach(function (text) {
      var p = document.createElement("p");
      p.textContent = text;
      host.appendChild(p);
    });
    if (n % 5 === 0) {
      contentChanged();
      await new Promise(function (r) { setTimeout(r, 0); });   // let the page breathe
    }
  }
  if (token !== renderToken) return;
  if (!host.textContent.trim()) {
    var p = document.createElement("p");
    p.style.opacity = ".75";
    p.textContent = "This PDF has no extractable text — it's probably a scan. " +
      "Page view will still show it, but there's no text to reflow or highlight.";
    host.appendChild(p);
  }
  contentChanged();
}

/* PDF text comes as positioned runs, not sentences. Group runs into lines by
   their y position, then join lines into paragraphs, treating a blank-ish gap
   or a line that ends in sentence punctuation followed by a big indent as a
   break. Heuristic, but it beats one <p> per run. */
function paragraphs(content) {
  var lines = [], cur = null, lastY = null;
  content.items.forEach(function (it) {
    if (typeof it.str !== "string") return;
    var y = it.transform ? Math.round(it.transform[5]) : 0;
    if (lastY === null || Math.abs(y - lastY) > 2) {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = { text: "", y: y };
      lastY = y;
    }
    cur.text += it.str;
    if (it.hasEOL) cur.text += " ";
  });
  if (cur && cur.text.trim()) lines.push(cur);

  var out = [], buf = "";
  for (var i = 0; i < lines.length; i++) {
    var text = lines[i].text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    // de-hyphenate across a line break
    if (/[a-z]-$/.test(buf)) buf = buf.slice(0, -1) + text;
    else buf = buf ? buf + " " + text : text;

    var next = lines[i + 1];
    var gap = next ? Math.abs(lines[i].y - next.y) : Infinity;
    var endsSentence = /[.!?]["')\]]?$/.test(text);
    // a noticeably bigger vertical gap, or a sentence end before one, is a break
    if (!next || gap > 22 || (endsSentence && gap > 16)) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/* ---------- toolbar ---------- */

$("rcp-mode").addEventListener("click", function () {
  mode = mode === "page" ? "reader" : "page";
  this.setAttribute("aria-pressed", String(mode === "reader"));
  this.textContent = mode === "reader" ? "Page view" : "Reading view";
  render();
});
$("rcp-in").addEventListener("click", function () {
  scale = Math.min(scale + 0.25, 4);
  if (mode === "page") render();
});
$("rcp-out").addEventListener("click", function () {
  scale = Math.max(scale - 0.25, 0.5);
  if (mode === "page") render();
});
$("rcp-open").addEventListener("click", function () {
  if (fileUrl) location.href = fileUrl;
});
