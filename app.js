// Joy Audio Tool — tìm file phát âm Oxford, nghe thử, tải gộp 1 file zip.
var RESULTS = [];
var FINDINGS = { ok: 0, edge: 0, google: 0, fail: 0 };

function $(id) { return document.getElementById(id); }
function monthKey() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function unlock() {
  var v = $("code").value.trim();
  var want = (window.MONTH_CODES || {})[monthKey()];
  if (!want) { alert("Tháng này chưa có mã, bạn hỏi quản lý nhé."); return; }
  if (v === want) {
    $("gate").style.display = "none";
    $("app").style.display = "block";
    try { sessionStorage.setItem("joy_audio_ok", monthKey()); } catch (e) {}
  } else {
    alert("Mã chưa đúng, bạn kiểm tra lại nhé.");
  }
}
try {
  if (sessionStorage.getItem("joy_audio_ok") === monthKey()) {
    $("gate").style.display = "none";
    $("app").style.display = "block";
  }
} catch (e) {}

// ---- Tìm file Oxford bằng cách đoán link (không cần qua trung gian) ----
function cleanWord(w) {
  return w.trim().toLowerCase()
    .replace(/^a\s+/, "")          // "a branch" -> "branch"
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ").trim();
}
function variants(w) {
  var out = [w];
  if (/\s/.test(w)) return out;    // cụm từ: giữ nguyên
  if (/ies$/.test(w)) out.push(w.replace(/ies$/, "y"));
  else if (/(ses|xes|zes|ches|shes)$/.test(w)) out.push(w.slice(0, -2));
  else if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (w === "toward") out.push("towards");
  var seen = {};
  return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
}
function oxfordCandidates(word, accent) {
  var noSpace = word.replace(/[\s'-]/g, "");
  if (!noSpace) return [];
  var kind = accent === "uk" ? "uk_pron" : "us_pron";
  var suf = accent === "uk" ? "gb" : "us";
  var p1 = noSpace[0];
  var p2 = (noSpace.slice(0, 3) + "___").slice(0, 3);
  var p3 = noSpace.slice(0, 5);
  while (p3.length < 5) p3 += "_";
  var base = "https://www.oxfordlearnersdictionaries.com/media/english/" + kind + "/" + p1 + "/" + p2 + "/" + p3;
  var urls = [];
  var file = noSpace + "__" + suf + "_";
  [1, 2, 3].forEach(function (n) { urls.push(base + "/" + file + n + ".mp3"); });
  if (/\s/.test(word)) { // cụm từ dạng "seed_coat_1_gb_1"
    var slug = word.replace(/\s+/g, "_");
    [1, 2].forEach(function (k) {
      [1, 2].forEach(function (n) { urls.push(base + "/" + slug + "_" + k + "__" + suf + "_" + n + ".mp3"); });
    });
  }
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

// ---- Giọng Edge đọc trực tiếp trên web (chỉ chạy khi mở bằng trình duyệt Edge) ----
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
// Trả về blob URL của file mp3, hoặc null nếu trình duyệt bị chặn (dùng Chrome sẽ bị chặn)
function edgeSynthesize(text, voice) {
  return new Promise(function (resolve) {
    var done = false;
    function fin(v) { if (!done) { done = true; resolve(v); } }
    var to = setTimeout(function () { fin(null); }, 20000);
    var url;
    edgeGec().then(function (g) {
      url = EDGE_WSS + "&ConnectionId=" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now())) + "&Sec-MS-GEC=" + g + "&Sec-MS-GEC-Version=" + EDGE_VER;
      var ws;
      try { ws = new WebSocket(url); } catch (e) { clearTimeout(to); fin(null); return; }
      ws.binaryType = "arraybuffer";
      var chunks = [];
      ws.onopen = function () {
        ws.send("X-Timestamp:" + edgeDateStr() + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n");
        var ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='" + edgeFullVoice(voice) + "'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>" + edgeEscape(text) + "</prosody></voice></speak>";
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
async function findOne(rawWord, mode) {
  var word = cleanWord(rawWord);
  if (!word) return { word: rawWord, ok: false, note: "từ trống" };
  var useEdgeVoice = mode.indexOf("oxford-") !== 0 ? mode : (mode === "oxford-uk" ? "en-GB-SoniaNeural" : "en-US-AriaNeural");
  var accent = mode === "oxford-us" || /^en-US/i.test(mode) ? "us" : "uk";
  // Chế độ chọn giọng Edge cụ thể: đọc Edge hết cho đều giọng
  if (mode.indexOf("oxford-") !== 0) {
    var eu = await edgeSynthesize(word, mode);
    if (eu) return { word: rawWord.trim(), ok: true, url: eu, edge: true, blob: true, note: "" };
    return { word: rawWord.trim(), ok: true, url: googleTTS(word, accent), google: true, note: "trình duyệt này chặn giọng Edge, dùng giọng đọc thay thế" };
  }
  var vs = variants(word);
  for (var i = 0; i < vs.length; i++) {
    var cands = oxfordCandidates(vs[i], accent);
    for (var j = 0; j < cands.length; j++) {
      if (await audioOK(cands[j])) {
        return { word: rawWord.trim(), ok: true, url: cands[j], oxford: true, note: vs[i] !== word ? "lấy theo từ “" + vs[i] + "”" : "" };
      }
    }
  }
  // Oxford không có (cụm từ, từ hiếm) → thử giọng Edge trước
  var eu2 = await edgeSynthesize(word, useEdgeVoice);
  if (eu2) return { word: rawWord.trim(), ok: true, url: eu2, edge: true, blob: true, note: "Oxford không có, đọc bằng giọng Edge" };
  // Trình duyệt Chrome chặn Edge → dùng giọng Google đọc thay (vẫn có tiếng)
  return { word: rawWord.trim(), ok: true, url: googleTTS(word, accent), google: true, note: "Oxford không có, dùng giọng đọc thay thế" };
}

async function start() {
  var lines = $("words").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) { alert("Bạn dán danh sách từ vào ô trước nhé."); return; }
  var mode = $("voice").value;
  var btn = document.querySelector("button");
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
      $("status").textContent = "Đã tìm " + done + "/" + lines.length + "...";
      renderRow(r, mode);
    }
  }
  var ws = [];
  for (var k = 0; k < Math.min(CONC, jobs.length); k++) ws.push(worker());
  await Promise.all(ws);
  RESULTS.forEach(function (r) { if (!r.ok) FINDINGS.fail++; else if (r.oxford) FINDINGS.ok++; else if (r.edge) FINDINGS.edge++; else FINDINGS.google++; });
  $("status").textContent = "Xong: " + FINDINGS.ok + " file Oxford" + (FINDINGS.edge ? ", " + FINDINGS.edge + " giọng Edge" : "") + (FINDINGS.google ? ", " + FINDINGS.google + " giọng thay thế" : "") + (FINDINGS.fail ? ", " + FINDINGS.fail + " không tìm được" : "") + ".";
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
    if (r.blob) inner += ' <a href="' + r.url + '" download="' + dl + '">tải lẻ</a>';
    else inner += ' <a href="' + r.url + '" target="_blank" rel="noopener">tải lẻ</a>';
  } else {
    inner += ' <small class="fail">không tìm được</small>';
  }
  div.innerHTML = inner;
  $("list").appendChild(div);
}
// Nghe thử giọng mẫu (1 file, bấm lại để dừng)
var SAMPLE_AUDIO = null, SAMPLE_BTN = null;
function playSample(src, btn) {
  if (SAMPLE_AUDIO && SAMPLE_BTN === btn && !SAMPLE_AUDIO.paused) { SAMPLE_AUDIO.pause(); btn.textContent = btn.textContent.replace("⏸ ", ""); return; }
  if (SAMPLE_AUDIO) { SAMPLE_AUDIO.pause(); if (SAMPLE_BTN) SAMPLE_BTN.textContent = SAMPLE_BTN.textContent.replace("⏸ ", ""); }
  SAMPLE_AUDIO = new Audio(src);
  SAMPLE_BTN = btn;
  btn.textContent = "⏸ " + btn.textContent.replace("⏸ ", "");
  SAMPLE_AUDIO.onended = function () { btn.textContent = btn.textContent.replace("⏸ ", ""); };
  SAMPLE_AUDIO.play();
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

// ---- Tải gộp zip (đi qua proxy công cộng, file nào kẹt thì bấm "tải lẻ") ----
function proxyOf(u) {
  return [
    "https://api.cors.lol/?url=" + encodeURIComponent(u),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(u)
  ];
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
    } catch (e) { /* thử proxy tiếp theo */ }
  }
  return null;
}
async function downloadZip() {
  var mode = $("voice").value;
  var label = mode.indexOf("oxford-") === 0 ? mode.replace("oxford-", "") : mode.replace("Neural", "");
  var oks = RESULTS.filter(function (r) { return r && r.ok; });
  if (!oks.length) return;
  $("zipBtn").disabled = true;
  $("status").textContent = "Đang gom file vào zip, bạn đợi chút...";
  var zip = new JSZip();
  var missing = [], di = 0;
  for (var i = 0; i < oks.length; i++) {
    var r = oks[i];
    var buf = await fetchBytes(r.url);
    di++;
    $("status").textContent = "Đang gom " + di + "/" + oks.length + "...";
    if (buf) {
      var fname = r.word.replace(/\s+/g, "_") + "_" + label + ".mp3";
      zip.file(fname, buf);
    } else missing.push(r.word);
  }
  if (!Object.keys(zip.files).length) {
    $("status").textContent = "Mạng đang chặn tải gộp, bạn bấm “tải lẻ” từng từ nhé.";
    $("zipBtn").disabled = false;
    return;
  }
  var blob = await zip.generateAsync({ type: "blob" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "phat-am-" + label.toLowerCase() + ".zip";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  $("status").textContent = missing.length
    ? "Đã tải zip (thiếu " + missing.length + " từ: " + missing.join(", ") + " — bấm “tải lẻ” cho mấy từ này)."
    : "Đã tải xong đủ " + oks.length + " file trong 1 file zip.";
  $("zipBtn").disabled = false;
}
