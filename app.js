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
  syncSpeed("speed", "speedVal");
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
async function findOne(rawWord, mode) {
  var word = cleanWord(rawWord);
  if (!word) return { word: rawWord, ok: false, note: "empty word" };
  var accent = mode === "oxford-us" || /^en-US/i.test(mode) ? "us" : "uk";
  
  // If user chose a specific TTS voice (not Oxford), generate directly with Google TTS
  if (mode.indexOf("oxford-") !== 0) {
    var gUrl = googleTTS(rawWord.trim(), mode);
    return { word: rawWord.trim(), ok: true, url: gUrl, edge: true, note: "generated voice" };
  }
  
  // Try Oxford dictionary first (single words & common phrases)
  var vs = variants(word);
  for (var i = 0; i < vs.length; i++) {
    var cands = oxfordCandidates(vs[i], accent);
    for (var j = 0; j < cands.length; j++) {
      if (await audioOK(cands[j])) {
        return { word: rawWord.trim(), ok: true, url: cands[j], oxford: true, note: vs[i] !== word ? "from “" + vs[i] + "”" : "" };
      }
    }
  }
  
  // Oxford not found → generate with Google TTS (handles multi-word phrases, compound words)
  var gUrl = googleTTS(rawWord.trim(), mode);
  return { word: rawWord.trim(), ok: true, url: gUrl, edge: true, note: "Oxford not found, generated" };
}

async function startVocab() {
  var lines = $("words").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) { alert("Please enter words in the box first."); return; }
  var mode = document.querySelector('input[name="voice"]:checked').value;
  var btn = document.querySelector("#tab0 button");
  btn.disabled = true;
  $("zipBtn").disabled = true;
  $("list").innerHTML = "";
  $("bar").style.width = "0%";
  RESULTS = [];
  FINDINGS = { ok: 0, edge: 0, google: 0, fail: 0 };
  var done = 0;
  var jobs = lines.map(function (w) { return function () { return findOne(w, mode); }; });
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
  RESULTS.forEach(function (r) { if (!r.ok) FINDINGS.fail++; else if (r.oxford) FINDINGS.ok++; else FINDINGS.edge++; });
  $("status").textContent = "Done: " + FINDINGS.ok + " Oxford" + (FINDINGS.edge ? ", " + FINDINGS.edge + " generated" : "") + (FINDINGS.fail ? ", " + FINDINGS.fail + " failed" : "") + ".";
  $("zipBtn").disabled = !RESULTS.some(function (r) { return r && r.ok; });
  btn.disabled = false;
}

function renderRow(r, mode) {
  var div = document.createElement("div");
  div.className = "word";
  var tag = r.ok ? (r.oxford ? '<span class="ok">✔</span>' : '<span class="ok">♫</span>') : '<span class="fail">✘</span>';
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
  var mode = document.querySelector('input[name="voice"]:checked').value;
  var label = mode.indexOf("oxford-") === 0 ? mode.replace("oxford-", "") : "generated";
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
