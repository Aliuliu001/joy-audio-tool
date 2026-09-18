// Joy Audio Tool — Download Oxford pronunciation & generate dialogues (StreamElements TTS API - no WS block)
var RESULTS = [];
var FINDINGS = { ok: 0, edge: 0, google: 0, fail: 0 };
var PARA_BLOB = null;
var PREVIEW_AUDIO = null;

function $(id) { return document.getElementById(id); }
function monthKey() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function unlock() {
  var v = $("code").value.trim();
  var want = (window.MONTH_CODES || {})[monthKey()];
  if (!want) { alert("No code for this month yet. Please contact the manager."); return; }
  if (v === want) {
    $("gate").style.display = "none";
    $("app").style.display = "block";
    try { sessionStorage.setItem("joy_audio_ok", monthKey()); } catch (e) {}
  } else {
    alert("Incorrect code. Please check again.");
  }
}
try {
  if (sessionStorage.getItem("joy_audio_ok") === monthKey()) {
    $("gate").style.display = "none";
    $("app").style.display = "block";
  }
} catch (e) {}

// Speed slider sync
function syncSpeed(sliderId, valId) {
  var s = $(sliderId), v = $(valId);
  if (!s || !v) return;
  s.addEventListener("input", function () {
    var val = parseFloat(s.value);
    var snaps = [0.25, 0.5, 0.75, 0.85, 1, 1.1, 1.25, 1.5];
    for (var i = 0; i < snaps.length; i++) {
      if (Math.abs(val - snaps[i]) < 0.03) { s.value = snaps[i]; val = snaps[i]; break; }
    }
    v.textContent = val.toFixed(2) + "×";
  });
}
document.addEventListener("DOMContentLoaded", function () {
  // Speed slider removed, keeping DOMContentLoaded for future use
});

function switchTab(idx) {
  var tabs = document.querySelectorAll(".tab");
  var contents = document.querySelectorAll(".tab-content");
  tabs.forEach(function (t, i) { t.className = i === idx ? "tab active" : "tab"; });
  contents.forEach(function (c, i) { c.className = i === idx ? "tab-content active" : "tab-content"; });
}

// Preview voice samples (2 files: yn + wh)
function playPreview(prefix, btn) {
  if (PREVIEW_AUDIO) { PREVIEW_AUDIO.pause(); }
  PREVIEW_AUDIO = new Audio("voices/" + prefix + "-yn.mp3");
  btn.textContent = "⏸ " + btn.textContent.replace("⏸ ", "");
  PREVIEW_AUDIO.onended = function () {
    var a2 = new Audio("voices/" + prefix + "-wh.mp3");
    a2.play();
    a2.onended = function () { btn.textContent = btn.textContent.replace("⏸ ", ""); };
  };
  PREVIEW_AUDIO.play();
}

// ---- Cambridge Dictionary Candidate Finder ----
function cambridgeCandidates(word, accent) {
  // Cambridge URL pattern: https://dictionary.cambridge.org/us/media/english/{accent}_pron/{first}/{first+second}/{word}/{word}.mp3
  var noSpace = word.replace(/[\\s'-]/g, "").toLowerCase();
  if (!noSpace) return [];
  var prefix = accent === "us" ? "us" : "uk";
  var f1 = noSpace[0];
  var f2 = noSpace.length > 1 ? noSpace.slice(0, 2) : noSpace[0] + noSpace[0];
  var f3 = noSpace.length > 2 ? noSpace.slice(0, 3) : f2 + noSpace[0];
  
  var urls = [];
  // Try multiple path patterns
  urls.push("https://dictionary.cambridge.org/us/media/english/" + prefix + "_pron/" + f1 + "/" + f2 + "/" + word + "/" + word + ".mp3");
  urls.push("https://dictionary.cambridge.org/media/english/" + prefix + "_pron/" + f1 + "/" + f3 + "/" + word + "/" + word + ".mp3");
  urls.push("https://dictionary.cambridge.org/media/english/" + prefix + "_pron/" + f1 + "/" + f2 + "/" + noSpace + "/" + noSpace + ".mp3");
  return urls;
}

// ---- Oxford Dictionary Candidate Finder ----
function cleanWord(w) {
  return w.trim().toLowerCase()
    .replace(/^a\s+/, "")
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ").trim();
}
function variants(w) {
  var out = [w];
  if (/\s/.test(w)) return out;
  if (/ies$/.test(w)) out.push(w.replace(/ies$/, "y"));
  else if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
  else if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (w === "toward") out.push("towards");
  var seen = {};
  return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
}
function oxfordCandidates(word, accent) {
  var kind = accent === "uk" ? "uk_pron" : "us_pron";
  var suf = accent === "uk" ? "gb" : "us";
  function baseFor(w) {
    var noSpace = w.replace(/[\s'-]/g, "");
    if (!noSpace) return null;
    var p1 = noSpace[0];
    var p2 = (noSpace.slice(0, 3) + "___").slice(0, 3);
    var p3 = noSpace.slice(0, 5);
    while (p3.length < 5) p3 += "_";
    return "https://www.oxfordlearnersdictionaries.com/media/english/" + kind + "/" + p1 + "/" + p2 + "/" + p3;
  }
  var urls = [];
  var isPhrase = /[\s-]/.test(word);
  if (isPhrase) {
    var first = word.split(/[\s-]+/)[0];
    var slug = word.replace(/[\s-]+/g, "_");
    var b = baseFor(first);
    if (b) [1, 2].forEach(function (k) {
      [1, 2, 3].forEach(function (n) { urls.push(b + "/" + slug + "_" + k + "__" + suf + "_" + n + ".mp3"); });
    });
    return urls;
  }
  var noSpace = word.replace(/[\s'-]/g, "");
  if (!noSpace) return [];
  var base = baseFor(word);
  var file = noSpace + "__" + suf + "_";
  [1, 2, 3].forEach(function (n) { urls.push(base + "/" + file + n + ".mp3"); });
  return urls;
}
function audioOK(url, ms) {
  ms = ms || 9000;
  return new Promise(function (res) {
    var a = new Audio(), done = false;
    var to = setTimeout(function () { if (!done) { done = true; a.removeAttribute("src"); res(false); } }, ms);
    a.addEventListener("loadeddata", function () { if (!done) { done = true; clearTimeout(to); res(true); } });
    a.addEventListener("error", function () { if (!done) { done = true; clearTimeout(to); res(false); } });
    a.preload = "auto";
    a.src = url;
  });
}
// ---- Google Translate TTS (free, no API key needed) ----
function googleTTS(text, voiceId) {
  // Map voice IDs to Google Translate language codes
  var tl = "en-US"; // default US
  if (/^en-GB/i.test(voiceId) || voiceId === "oxford-uk") {
    tl = "en-GB";
  }
  var url = "https://translate.google.com/translate_tts?ie=UTF-8&q=" + encodeURIComponent(text) + "&tl=" + tl + "&client=tw-ob";
  return url;
}

// ---- Tab 1: Vocabulary Search ----
async function findOne(rawWord, accent, source) {
  var word = cleanWord(rawWord);
  if (!word) return { word: rawWord, ok: false, note: "empty word" };
  
  source = source || "oxford"; // default Oxford
  var vs = variants(word);
  
  if (source === "oxford") {
    // Try Oxford dictionary only
    for (var i = 0; i < vs.length; i++) {
      var cands = oxfordCandidates(vs[i], accent);
      for (var j = 0; j < cands.length; j++) {
        if (await audioOK(cands[j])) {
          return { word: rawWord.trim(), ok: true, url: cands[j], source: "oxford", note: vs[i] !== word ? "from \"" + vs[i] + "\"" : "" };
        }
      }
    }
    return { word: rawWord.trim(), ok: false, note: "not found in Oxford" };
  }
  
  if (source === "cambridge") {
    // Try Cambridge dictionary only
    for (var i = 0; i < vs.length; i++) {
      var cambCands = cambridgeCandidates(vs[i], accent);
      for (var j = 0; j < cambCands.length; j++) {
        if (await audioOK(cambCands[j])) {
          return { word: rawWord.trim(), ok: true, url: cambCands[j], source: "cambridge", note: vs[i] !== word ? "from \"" + vs[i] + "\"" : "" };
        }
      }
    }
    return { word: rawWord.trim(), ok: false, note: "not found in Cambridge" };
  }
  
  return { word: rawWord.trim(), ok: false, note: "unknown source" };
}

async function startVocab() {
  var lines = $("words").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) { alert("Please enter words in the box first."); return; }
  var accent = document.querySelector('input[name="accent"]:checked').value;
  var btn = document.querySelector("#tab0 button");
  btn.disabled = true;
  $("zipBtn").disabled = true;
  $("cambridgeBtn").disabled = true;
  $("list").innerHTML = "";
  $("bar").style.width = "0%";
  RESULTS = [];
  FINDINGS = { ok: 0, edge: 0, google: 0, fail: 0 };
  var done = 0;
  var jobs = lines.map(function (w) { return function () { return findOne(w, accent, "oxford"); }; });
  var CONC = 6, idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      var my = idx++;
      var r = await jobs[my]();
      RESULTS[my] = r;
      done++;
      $("bar").style.width = Math.round(done / lines.length * 100) + "%";
      $("status").textContent = "Processed " + done + "/" + lines.length + "...";
      renderRow(r, mode);
    }
  }
  var ws = [];
  for (var k = 0; k < Math.min(CONC, jobs.length); k++) ws.push(worker());
  await Promise.all(ws);
  RESULTS.forEach(function (r) { if (!r.ok) FINDINGS.fail++; else FINDINGS.ok++; });
  var failedWords = RESULTS.filter(function (r) { return !r.ok; }).map(function (r) { return r.word; });
  $("status").textContent = "Done: " + FINDINGS.ok + " found in Oxford" + (FINDINGS.fail ? ", " + FINDINGS.fail + " not found: " + failedWords.join(", ") : "") + ".";
  $("zipBtn").disabled = !RESULTS.some(function (r) { return r && r.ok; });
  $("cambridgeBtn").disabled = FINDINGS.fail === 0;
  btn.disabled = false;
}

async function searchCambridge() {
  var accent = document.querySelector('input[name="accent"]:checked').value;
  var failedIndices = [];
  RESULTS.forEach(function (r, idx) { if (!r.ok) failedIndices.push(idx); });
  if (!failedIndices.length) return;
  
  var btn = $("cambridgeBtn");
  btn.disabled = true;
  $("bar").style.width = "0%";
  $("status").textContent = "Searching Cambridge for " + failedIndices.length + " words...";
  
  var done = 0;
  var jobs = failedIndices.map(function (idx) {
    return async function () {
      var oldResult = RESULTS[idx];
      var newResult = await findOne(oldResult.word, accent, "cambridge");
      RESULTS[idx] = newResult;
      done++;
      $("bar").style.width = Math.round(done / failedIndices.length * 100) + "%";
      $("status").textContent = "Searching Cambridge " + done + "/" + failedIndices.length + "...";
      updateRow(idx, newResult);
    };
  });
  
  var CONC = 6, idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      var my = idx++;
      await jobs[my]();
    }
  }
  var ws = [];
  for (var k = 0; k < Math.min(CONC, jobs.length); k++) ws.push(worker());
  await Promise.all(ws);
  
  var oxfordCount = RESULTS.filter(function (r) { return r.source === "oxford"; }).length;
  var cambridgeCount = RESULTS.filter(function (r) { return r.source === "cambridge"; }).length;
  var failedWords = RESULTS.filter(function (r) { return !r.ok; }).map(function (r) { return r.word; });
  var msg = "Done: " + (oxfordCount + cambridgeCount) + " found";
  if (oxfordCount > 0) msg += " (" + oxfordCount + " Oxford";
  if (cambridgeCount > 0) msg += (oxfordCount > 0 ? ", " : " (") + cambridgeCount + " Cambridge)";
  else if (oxfordCount > 0) msg += ")";
  if (failedWords.length > 0) msg += ", " + failedWords.length + " not found: " + failedWords.join(", ");
  $("status").textContent = msg + ".";
  $("zipBtn").disabled = !RESULTS.some(function (r) { return r && r.ok; });
  btn.disabled = failedWords.length === 0;
}

function renderRow(r, mode) {
  var div = document.createElement("div");
  div.className = "word";
  div.id = "word-" + RESULTS.indexOf(r);
  var tag = r.ok ? '<span class="ok">✔</span>' : '<span class="fail">✘</span>';
  var inner = tag + "<b>" + escapeHtml(r.word) + "</b>";
  if (r.note) inner += ' <small class="hint">(' + escapeHtml(r.note) + ")</small>";
  if (r.ok) {
    inner += '<audio controls preload="none" src="' + r.url + '"></audio>';
    var dl = r.word.replace(/\s+/g, "_") + ".mp3";
    inner += ' <a href="' + r.url + '" download="' + dl + '">download</a>';
  } else {
    inner += ' <small class="fail">not found</small>';
  }
  div.innerHTML = inner;
  $("list").appendChild(div);
}

function updateRow(idx, r) {
  var div = document.getElementById("word-" + idx);
  if (!div) return;
  var tag = r.ok ? '<span class="ok">✔</span>' : '<span class="fail">✘</span>';
  var inner = tag + "<b>" + escapeHtml(r.word) + "</b>";
  if (r.note) inner += ' <small class="hint">(' + escapeHtml(r.note) + ")</small>";
  if (r.ok) {
    inner += '<audio controls preload="none" src="' + r.url + '"></audio>';
    var dl = r.word.replace(/\s+/g, "_") + ".mp3";
    inner += ' <a href="' + r.url + '" download="' + dl + '">download</a>';
  } else {
    inner += ' <small class="fail">not found</small>';
  }
  div.innerHTML = inner;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

// ---- Zip Download for Vocabulary ----
function proxyOf(u) {
  var gtp = "https://www-oxfordlearnersdictionaries-com.translate.goog" + u.replace("https://www.oxfordlearnersdictionaries.com", "") + "?_x_tr_sl=en&_x_tr_tl=fr&_x_tr_hl=en";
  return [gtp];
}
async function fetchBytes(url) {
  // Google Translate TTS: fetch directly (CORS allowed with right params)
  if (url.indexOf("translate.google.com") !== -1) {
    try {
      var r = await fetch(url);
      if (r.ok) return await r.arrayBuffer();
    } catch (e) {}
  }
  var tries = proxyOf(url);
  for (var i = 0; i < tries.length; i++) {
    try {
      var ctl = new AbortController();
      var to = setTimeout(function () { ctl.abort(); }, 25000);
      var r = await fetch(tries[i], { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) continue;
      var b = await r.arrayBuffer();
      if (b.byteLength > 1000) return b;
    } catch (e) {}
  }
  return null;
}
async function downloadZip() {
  var accent = document.querySelector('input[name="accent"]:checked').value;
  var label = accent === "us" ? "us" : "uk";
  var oks = RESULTS.filter(function (r) { return r && r.ok; });
  if (!oks.length) return;
  $("zipBtn").disabled = true;
  $("status").textContent = "Gathering files into zip...";
  var zip = new JSZip();
  var missing = [], di = 0;
  for (var i = 0; i < oks.length; i++) {
    var r = oks[i];
    var buf = await fetchBytes(r.url);
    di++;
    $("status").textContent = "Gathering " + di + "/" + oks.length + "...";
    if (buf) {
      var fname = r.word.replace(/\s+/g, "_") + "_" + label + ".mp3";
      zip.file(fname, buf);
    } else missing.push(r.word);
  }
  if (!Object.keys(zip.files).length) {
    $("status").textContent = "Network blocked bulk download. Please use individual 'download' links.";
    $("zipBtn").disabled = false;
    return;
  }
  var blob = await zip.generateAsync({ type: "blob" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pronunciation-" + label.toLowerCase() + ".zip";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  $("status").textContent = missing.length
    ? "Zip downloaded (missing " + missing.length + " words: " + missing.join(", ") + " — use individual download links)."
    : "Successfully downloaded all " + oks.length + " files in a zip.";
  $("zipBtn").disabled = false;
}
