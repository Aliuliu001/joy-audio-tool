// Joy Audio Tool — Download Oxford pronunciation & generate dialogues
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
  syncSpeed("paraSpeed", "paraSpeedVal");
  syncSpeed("role1Speed", "role1SpeedVal");
  syncSpeed("role2Speed", "role2SpeedVal");
  $("paraText").addEventListener("input", detectDialogue);
});

function switchTab(idx) {
  var tabs = document.querySelectorAll(".tab");
  var contents = document.querySelectorAll(".tab-content");
  tabs.forEach(function (t, i) { t.className = i === idx ? "tab active" : "tab"; });
  contents.forEach(function (c, i) { c.className = i === idx ? "tab-content active" : "tab-content"; });
}

function detectDialogue() {
  var txt = $("paraText").value;
  var lines = txt.split("\n").filter(function (l) { return l.trim(); });
  var roles = {};
  var hasDialogue = false;
  lines.forEach(function (line) {
    var m = line.match(/^([A-Za-z][A-Za-z0-9\s]*?):\s*(.+)/);
    if (m && m[2].trim()) { roles[m[1].trim()] = true; hasDialogue = true; }
  });
  var roleNames = Object.keys(roles);
  if (hasDialogue && roleNames.length >= 2) {
    $("singleMode").classList.remove("active");
    $("dialogueMode").style.display = "block";
    $("dialogueMode").classList.add("active");
    $("role1Name").textContent = roleNames[0];
    $("role2Name").textContent = roleNames[1];
    $("role1Label").textContent = roleNames[0] + ":";
    $("role2Label").textContent = roleNames[1] + ":";
  } else {
    $("singleMode").classList.add("active");
    $("dialogueMode").style.display = "none";
    $("dialogueMode").classList.remove("active");
  }
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
function googleTTS(word, accent) {
  var tl = accent === "uk" ? "en-GB" : "en-US";
  return "https://translate.google.com/translate_tts?ie=UTF-8&q=" + encodeURIComponent(word) + "&tl=" + tl + "&client=tw-ob";
}

// ---- Edge TTS Client ----
var EDGE_VER = "1-143.0.3650.75";
var EDGE_TRUSTED = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
var EDGE_WSS = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" + EDGE_TRUSTED;
function edgeFullVoice(v) {
  var m = v.match(/^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/);
  if (!m) return v;
  var l = m[1], r = m[2], n = m[3];
  if (n.indexOf("-") !== -1) { r = r + "-" + n.slice(0, n.indexOf("-")); n = n.slice(n.indexOf("-") + 1); }
  return "Microsoft Server Speech Text to Speech Voice (" + l + "-" + r + ", " + n + ")";
}
function edgeDateStr() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
  var D = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return D[d.getUTCDay()] + " " + M[d.getUTCMonth()] + " " + p(d.getUTCDate()) + " " + d.getUTCFullYear() + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " GMT+0000 (Coordinated Universal Time)";
}
async function edgeGec() {
  var t = Math.floor(Date.now() / 1000) + 11644473600;
  t -= t % 300;
  var ticks = Math.floor(t * 1e9 / 100);
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(ticks) + EDGE_TRUSTED));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").toUpperCase();
}
function edgeEscape(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function edgeSynthesize(text, voice, rate) {
  rate = rate || "+0%";
  return new Promise(function (resolve) {
    var done = false;
    function fin(v) { if (!done) { done = true; resolve(v); } }
    var to = setTimeout(function () { fin(null); }, 25000);
    edgeGec().then(function (g) {
      var url = EDGE_WSS + "&ConnectionId=" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now())) + "&Sec-MS-GEC=" + g + "&Sec-MS-GEC-Version=" + EDGE_VER;
      var ws;
      try { ws = new WebSocket(url); } catch (e) { clearTimeout(to); fin(null); return; }
      ws.binaryType = "arraybuffer";
      var chunks = [];
      ws.onopen = function () {
        ws.send("X-Timestamp:" + edgeDateStr() + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n");
        var ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='" + edgeFullVoice(voice) + "'><prosody pitch='+0Hz' rate='" + rate + "' volume='+0%'>" + edgeEscape(text) + "</prosody></voice></speak>";
        var rid = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now());
        ws.send("X-RequestId:" + rid + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + edgeDateStr() + "Z\r\nPath:ssml\r\n\r\n" + ssml);
      };
      ws.onmessage = function (ev) {
        if (typeof ev.data === "string") {
          if (ev.data.indexOf("turn.end") !== -1) {
            clearTimeout(to);
            try { ws.close(); } catch (e) {}
            if (chunks.length) fin(URL.createObjectURL(new Blob(chunks, { type: "audio/mpeg" })));
            else fin(null);
          }
        } else {
          var b = new Uint8Array(ev.data);
          if (b.length > 2) {
            var hl = (b[0] << 8) | b[1];
            var head = "";
            for (var i = 2; i < Math.min(2 + hl, b.length); i++) head += String.fromCharCode(b[i]);
            if (head.indexOf("audio/mpeg") !== -1) chunks.push(ev.data.slice(2 + hl));
          }
        }
      };
      ws.onerror = function () { clearTimeout(to); try { ws.close(); } catch (e) {} fin(null); };
      ws.onclose = function () { clearTimeout(to); fin(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: "audio/mpeg" })) : null); };
    }).catch(function () { clearTimeout(to); fin(null); });
  });
}

// ---- Tab 1: Vocabulary Search ----
async function findOne(rawWord, mode) {
  var word = cleanWord(rawWord);
  if (!word) return { word: rawWord, ok: false, note: "empty word" };
  var speed = parseFloat($("speed").value || "1") || 1;
  var rateStr = "+" + Math.round((speed - 1) * 100) + "%";
  var useEdgeVoice = mode.indexOf("oxford-") !== 0 ? mode : (mode === "oxford-uk" ? "en-GB-SoniaNeural" : "en-US-AriaNeural");
  var accent = mode === "oxford-us" || /^en-US/i.test(mode) ? "us" : "uk";
  
  if (mode.indexOf("oxford-") !== 0) {
    var eu = await edgeSynthesize(word, mode, rateStr);
    if (eu) return { word: rawWord.trim(), ok: true, url: eu, edge: true, blob: true, voice: mode, rate: rateStr, note: "" };
    return { word: rawWord.trim(), ok: true, url: googleTTS(word, accent), google: true, note: "browser blocked Edge TTS, using fallback" };
  }
  
  var vs = variants(word);
  for (var i = 0; i < vs.length; i++) {
    var cands = oxfordCandidates(vs[i], accent);
    for (var j = 0; j < cands.length; j++) {
      if (await audioOK(cands[j])) {
        return { word: rawWord.trim(), ok: true, url: cands[j], oxford: true, note: vs[i] !== word ? "from “" + vs[i] + "”" : "" };
      }
    }
  }
  
  var eu2 = await edgeSynthesize(word, useEdgeVoice, rateStr);
  if (eu2) return { word: rawWord.trim(), ok: true, url: eu2, edge: true, blob: true, voice: useEdgeVoice, rate: rateStr, note: "Oxford not found, generated via Edge" };
  
  return { word: rawWord.trim(), ok: true, url: googleTTS(word, accent), google: true, note: "Oxford not found, using fallback" };
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
  RESULTS.forEach(function (r) { if (!r.ok) FINDINGS.fail++; else if (r.oxford) FINDINGS.ok++; else if (r.edge) FINDINGS.edge++; else FINDINGS.google++; });
  $("status").textContent = "Done: " + FINDINGS.ok + " Oxford" + (FINDINGS.edge ? ", " + FINDINGS.edge + " Edge" : "") + (FINDINGS.google ? ", " + FINDINGS.google + " fallback" : "") + (FINDINGS.fail ? ", " + FINDINGS.fail + " failed" : "") + ".";
  $("zipBtn").disabled = !RESULTS.some(function (r) { return r && r.ok; });
  btn.disabled = false;
}

function renderRow(r, mode) {
  var div = document.createElement("div");
  div.className = "word";
  var tag = r.ok ? (r.oxford ? '<span class="ok">✔</span>' : (r.edge ? '<span class="ok">♫</span>' : '<span style="color:#B8860B">~</span>')) : '<span class="fail">✘</span>';
  var inner = tag + "<b>" + escapeHtml(r.word) + "</b>";
  if (r.note) inner += ' <small class="hint">(' + escapeHtml(r.note) + ")</small>";
  if (r.ok) {
    inner += '<audio controls preload="none" src="' + r.url + '"></audio>';
    var dl = r.word.replace(/\s+/g, "_") + ".mp3";
    if (r.blob) inner += ' <a href="' + r.url + '" download="' + dl + '">download</a>';
    else inner += ' <a href="' + r.url + '" target="_blank" rel="noopener">download</a>';
  } else {
    inner += ' <small class="fail">not found</small>';
  }
  div.innerHTML = inner;
  $("list").appendChild(div);
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

// ---- Tab 2: Paragraph & Dialogue Generator ----
async function generatePara() {
  var txt = $("paraText").value.trim();
  if (!txt) { alert("Please enter a paragraph or dialogue."); return; }
  var isDialogue = $("dialogueMode").classList.contains("active");
  var btn = document.querySelector("#tab1 button");
  btn.disabled = true;
  $("paraDownBtn").disabled = true;
  $("paraStatus").textContent = "Generating audio via Edge TTS...";
  $("paraBar").style.width = "50%";
  $("paraPreview").innerHTML = "";

  try {
    var blobUrl;
    if (!isDialogue) {
      var voice = $("paraVoice").value;
      var speed = parseFloat($("paraSpeed").value || "1") || 1;
      var rateStr = "+" + Math.round((speed - 1) * 100) + "%";
      blobUrl = await edgeSynthesize(txt, voice, rateStr);
    } else {
      var lines = txt.split("\n").filter(function (l) { return l.trim(); });
      var parts = [];
      var role1 = $("role1Name").textContent;
      var role2 = $("role2Name").textContent;
      var v1 = $("role1Voice").value;
      var v2 = $("role2Voice").value;
      var s1 = parseFloat($("role1Speed").value || "1") || 1;
      var s2 = parseFloat($("role2Speed").value || "1") || 1;
      var r1Str = "+" + Math.round((s1 - 1) * 100) + "%";
      var r2Str = "+" + Math.round((s2 - 1) * 100) + "%";

      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^([A-Za-z][A-Za-z0-9\s]*?):\s*(.+)/);
        if (m && m[2].trim()) {
          var name = m[1].trim();
          var sentence = m[2].trim();
          var v = name === role1 ? v1 : v2;
          var r = name === role1 ? r1Str : r2Str;
          var u = await edgeSynthesize(sentence, v, r);
          if (u) {
            var rb = await fetch(u);
            if (rb.ok) parts.push(await rb.arrayBuffer());
          }
        } else {
          // Normal line in dialogue
          var u = await edgeSynthesize(lines[i], v1, r1Str);
          if (u) {
            var rb = await fetch(u);
            if (rb.ok) parts.push(await rb.arrayBuffer());
          }
        }
      }
      if (parts.length) {
        var combined = new Blob(parts, { type: "audio/mpeg" });
        blobUrl = URL.createObjectURL(combined);
      }
    }

    $("paraBar").style.width = "100%";
    if (blobUrl) {
      PARA_BLOB = blobUrl;
      $("paraStatus").textContent = "Generation complete!";
      $("paraDownBtn").disabled = false;
      $("paraPreview").innerHTML = '<audio controls autoplay src="' + blobUrl + '" style="width:100%;margin-top:12px"></audio>';
    } else {
      $("paraStatus").textContent = "Generation failed (browser blocked WebSocket).";
    }
  } catch (e) {
    $("paraStatus").textContent = "Error: " + e.message;
  }
  btn.disabled = false;
}

async function downloadPara() {
  if (!PARA_BLOB) return;
  var a = document.createElement("a");
  a.href = PARA_BLOB;
  a.download = "paragraph-audio.mp3";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { a.remove(); }, 3000);
}

// ---- Zip Download for Vocabulary ----
function proxyOf(u) {
  var gtp = "https://www-oxfordlearnersdictionaries-com.translate.goog" + u.replace("https://www.oxfordlearnersdictionaries.com", "") + "?_x_tr_sl=en&_x_tr_tl=fr&_x_tr_hl=en";
  return [gtp];
}
async function fetchBytes(url) {
  if (url.indexOf("blob:") === 0) {
    try {
      var rb = await fetch(url);
      if (!rb.ok) return null;
      var ab = await rb.arrayBuffer();
      return ab.byteLength > 1000 ? ab : null;
    } catch (e) { return null; }
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
  var label = mode.indexOf("oxford-") === 0 ? mode.replace("oxford-", "") : mode.replace("Neural", "");
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
