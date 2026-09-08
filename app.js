// Joy Audio Tool — tìm file phát âm Oxford, nghe thử, tải gộp 1 file zip.
var RESULTS = [];
var FINDINGS = { ok: 0, google: 0, fail: 0 };

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
async function findOne(rawWord, accent) {
  var word = cleanWord(rawWord);
  if (!word) return { word: rawWord, ok: false, note: "từ trống" };
  var vs = variants(word);
  for (var i = 0; i < vs.length; i++) {
    var cands = oxfordCandidates(vs[i], accent);
    for (var j = 0; j < cands.length; j++) {
      if (await audioOK(cands[j])) {
        return { word: rawWord.trim(), ok: true, url: cands[j], oxford: true, note: vs[i] !== word ? "lấy theo từ “" + vs[i] + "”" : "" };
      }
    }
  }
  // Oxford không có → dùng giọng Google đọc thay (nghe được, nhưng không chuẩn bằng Oxford)
  return { word: rawWord.trim(), ok: true, url: googleTTS(word, accent), oxford: false, note: "Oxford không có, dùng giọng đọc thay thế" };
}

async function start() {
  var lines = $("words").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) { alert("Bạn dán danh sách từ vào ô trước nhé."); return; }
  var accent = $("accent").value;
  var btn = document.querySelector("button");
  btn.disabled = true;
  $("zipBtn").disabled = true;
  $("list").innerHTML = "";
  $("bar").style.width = "0%";
  RESULTS = [];
  FINDINGS = { ok: 0, google: 0, fail: 0 };
  var done = 0;
  var jobs = lines.map(function (w) { return function () { return findOne(w, accent); }; });
  var CONC = 6, idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      var my = idx++;
      var r = await jobs[my]();
      RESULTS[my] = r;
      done++;
      $("bar").style.width = Math.round(done / lines.length * 100) + "%";
      $("status").textContent = "Đã tìm " + done + "/" + lines.length + "...";
      renderRow(r, accent);
    }
  }
  var ws = [];
  for (var k = 0; k < Math.min(CONC, jobs.length); k++) ws.push(worker());
  await Promise.all(ws);
  RESULTS.forEach(function (r) { if (!r.ok) FINDINGS.fail++; else if (r.oxford) FINDINGS.ok++; else FINDINGS.google++; });
  $("status").textContent = "Xong: " + FINDINGS.ok + " file Oxford, " + FINDINGS.google + " giọng thay thế, " + FINDINGS.fail + " không tìm được.";
  $("zipBtn").disabled = !RESULTS.some(function (r) { return r && r.ok; });
  btn.disabled = false;
}
function renderRow(r, accent) {
  var div = document.createElement("div");
  div.className = "word";
  var tag = r.ok ? (r.oxford ? '<span class="ok">✔</span>' : '<span style="color:#B8860B">~</span>') : '<span class="fail">✘</span>';
  var inner = tag + "<b>" + escapeHtml(r.word) + "</b>";
  if (r.note) inner += ' <small class="hint">(' + escapeHtml(r.note) + ")</small>";
  if (r.ok) {
    inner += '<audio controls preload="none" src="' + r.url + '"></audio>';
    inner += ' <a href="' + r.url + '" target="_blank" rel="noopener">tải lẻ</a>';
  } else {
    inner += ' <small class="fail">không tìm được</small>';
  }
  div.innerHTML = inner;
  $("list").appendChild(div);
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
  var accent = $("accent").value.toUpperCase();
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
      var fname = r.word.replace(/\s+/g, "_") + "_" + accent + ".mp3";
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
  a.download = "phat-am-" + accent.toLowerCase() + ".zip";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  $("status").textContent = missing.length
    ? "Đã tải zip (thiếu " + missing.length + " từ: " + missing.join(", ") + " — bấm “tải lẻ” cho mấy từ này)."
    : "Đã tải xong đủ " + oks.length + " file trong 1 file zip.";
  $("zipBtn").disabled = false;
}
