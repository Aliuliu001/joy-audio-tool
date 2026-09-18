# 📘 HƯỚNG DẪN ĐẦY ĐỦ: TẠO APP JOY AUDIO TOOL

**Dự án:** Tải phát âm từ Oxford Dictionary + Cambridge Dictionary  
**Công nghệ:** HTML, CSS, JavaScript (vanilla - không cần framework)  
**Hosting:** GitHub Pages (miễn phí)  
**CORS Proxy:** Cloudflare Worker (miễn phí 100,000 lượt/ngày)

---

## 📋 MỤC LỤC

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Cấu trúc file](#2-cấu-trúc-file)
3. [Chi tiết từng file](#3-chi-tiết-từng-file)
4. [UI Design](#4-ui-design)
5. [Chức năng chính](#5-chức-năng-chính)
6. [Setup Cloudflare Worker](#6-setup-cloudflare-worker)
7. [Deploy lên GitHub Pages](#7-deploy-lên-github-pages)
8. [Sửa lỗi thường gặp](#8-sửa-lỗi-thường-gặp)
9. [Bảo trì hàng tháng](#9-bảo-trì-hàng-tháng)

---

## 1. TỔNG QUAN DỰ ÁN

### Mục đích
Tạo công cụ web giúp giáo viên/học sinh:
- Nhập danh sách từ vựng
- Tự động tìm và tải phát âm từ Oxford Dictionary
- Nếu không tìm thấy, tiếp tục tìm ở Cambridge Dictionary
- Download tất cả file MP3 trong 1 file ZIP

### Luồng hoạt động
```
Người dùng nhập mã tháng
    ↓
Nhập danh sách từ
    ↓
Bấm "1️⃣ Find in Oxford" → Tìm ở Oxford
    ↓
Nếu có từ không tìm thấy → Bấm "2️⃣ Search Cambridge"
    ↓
Bấm "3️⃣ Download zip" → Tải tất cả về
```

---

## 2. CẤU TRÚC FILE

```
joy-audio-tool/
├── index.html          # Giao diện chính
├── app.js              # Logic chính (tìm từ, download)
├── config.js           # Mã kích hoạt hàng tháng
├── sw.js              # Service Worker (đã bỏ không dùng)
├── audio-proxy-worker.js  # Code cho Cloudflare Worker
├── HUONG_DAN_DAY_DU.md    # File này
└── README.md          # Mô tả ngắn
```

---

## 3. CHI TIẾT TỪNG FILE

### 3.1. `index.html` - Giao diện

**Phần 1: Màn hình nhập mã**
```html
<div class="card" id="gate">
  <label>🔑 Nhập mã kích hoạt tháng này:</label>
  <input type="text" id="code" placeholder="Ví dụ: 142731">
  <button onclick="unlock()">Mở khóa</button>
</div>
```

**Phần 2: Màn hình chính (ẩn ban đầu)**
```html
<div id="app" style="display:none">
  <textarea id="words"></textarea>  <!-- Nhập từ -->
  <button onclick="startVocab()">1️⃣ Find in Oxford</button>
  <button id="cambridgeBtn">2️⃣ Search Cambridge</button>
  <button id="zipBtn">3️⃣ Download zip</button>
  <div id="list"></div>  <!-- Hiển thị kết quả -->
</div>
```

**Thư viện cần thiết:**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

---

### 3.2. `config.js` - Mã kích hoạt

```javascript
window.MONTH_CODES = {
  "2026-09": "142731",
  "2026-10": "332703",
  "2026-11": "628659",
  // ... thêm các tháng khác
};
```

**Cách thêm mã tháng mới:**
1. Vào GitHub → `config.js` → Bấm icon cây bút (Edit)
2. Thêm dòng: `"2027-09": "123456",`
3. Bấm "Commit changes"

---

### 3.3. `app.js` - Logic chính

#### A. Kiểm tra mã kích hoạt
```javascript
function unlock() {
  var code = document.getElementById("code").value.trim();
  var correctCode = window.MONTH_CODES[monthKey()];
  if (code === correctCode) {
    // Lưu vào sessionStorage để nhớ cho đến hết tháng
    sessionStorage.setItem("joy_audio_ok", monthKey());
    // Hiện app
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").style.display = "block";
  }
}
```

#### B. Tìm phát âm từ Oxford
```javascript
function oxfordCandidates(word, accent) {
  // Tạo URL Oxford theo pattern:
  // https://www.oxfordlearnersdictionaries.com/media/english/{uk_pron|us_pron}/
  //   {first_letter}/{first_3_chars}/{first_5_chars}/{word}__gb_1.mp3
  
  var noSpace = word.replace(/[\s'-]/g, "");
  var p1 = noSpace[0];
  var p2 = noSpace.slice(0, 3).padEnd(3, "_");
  var p3 = noSpace.slice(0, 5).padEnd(5, "_");
  var urls = [];
  for (var i = 1; i <= 3; i++) {
    urls.push(`https://www.oxfordlearnersdictionaries.com/media/english/${accent}_pron/${p1}/${p2}/${p3}/${noSpace}__${accent === 'uk' ? 'gb' : 'us'}_${i}.mp3`);
  }
  return urls;
}
```

#### C. Kiểm tra file có tồn tại không
```javascript
function audioOK(url) {
  return new Promise(function(resolve) {
    var audio = new Audio();
    audio.addEventListener("loadeddata", function() { resolve(true); });
    audio.addEventListener("error", function() { resolve(false); });
    audio.src = url;
  });
}
```

#### D. Tìm từ (Oxford → Cambridge)
```javascript
async function findOne(word, accent, source) {
  // 1. Thử Oxford trước
  var oxfordURLs = oxfordCandidates(word, accent);
  for (var url of oxfordURLs) {
    if (await audioOK(url)) {
      return { word, ok: true, url, source: "oxford" };
    }
  }
  
  // 2. Nếu không có, thử Cambridge
  if (source === "cambridge") {
    var cambURLs = cambridgeCandidates(word, accent);
    for (var url of cambURLs) {
      if (await audioOK(url)) {
        return { word, ok: true, url, source: "cambridge" };
      }
    }
  }
  
  return { word, ok: false, note: "not found" };
}
```

#### E. Download ZIP
```javascript
async function downloadZip() {
  var zip = new JSZip();
  var oks = RESULTS.filter(r => r.ok);
  
  for (var r of oks) {
    // Dùng Cloudflare Worker proxy để tải file
    var proxyURL = window.AUDIO_PROXY_URL + "?url=" + encodeURIComponent(r.url);
    var response = await fetch(proxyURL);
    var buffer = await response.arrayBuffer();
    zip.file(r.word + ".mp3", buffer);
  }
  
  var blob = await zip.generateAsync({ type: "blob" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pronunciation.zip";
  a.click();
}
```

---

## 4. UI DESIGN

### Màu sắc (Beige/Brown Theme)
```css
:root {
  --brown: #5C4A3A;      /* Nâu đậm - text chính, button */
  --beige: #F6F3EE;      /* Be - nền trang */
  --accent: #8B6F47;     /* Nâu nhạt - button phụ */
  --green: #4C7C5C;      /* Xanh - thành công */
  --red: #B04A3A;        /* Đỏ - lỗi */
}
```

### Card Style
```css
.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
```

### Button Style
```css
button {
  background: var(--brown);
  color: #fff;
  border: none;
  border-radius: 24px;
  padding: 12px 24px;
  font-size: 17px;
  cursor: pointer;
}
```

---

## 5. CHỨC NĂNG CHÍNH

### 5.1. Nhập mã hàng tháng
- Mỗi tháng có 1 mã 6 số
- Lưu trong `sessionStorage` → chỉ nhập 1 lần/tháng/máy
- Xóa cache trình duyệt = phải nhập lại

### 5.2. Tìm từ Oxford
- Tách từ theo dòng (hoặc dấu phẩy/chấm phẩy)
- Chạy song song 6 từ cùng lúc (tăng tốc)
- Thử nhiều biến thể: `studies` → thử cả `study`

### 5.3. Tìm Cambridge (dự phòng)
- Chỉ tìm các từ Oxford không có
- Cambridge có cấu trúc URL khác Oxford

### 5.4. Download ZIP
- Dùng Cloudflare Worker làm proxy (bypass CORS)
- Đóng gói tất cả file MP3 vào 1 file ZIP
- Tên file: `pronunciation-uk.zip` hoặc `pronunciation-us.zip`

---

## 6. SETUP CLOUDFLARE WORKER

### Vấn đề cần giải quyết
Trình duyệt không cho phép tải file từ Oxford/Cambridge trực tiếp (lỗi CORS). Cần máy chủ trung gian.

### Giải pháp: Cloudflare Worker
Miễn phí 100,000 lượt/ngày, đủ cho trường học dùng.

### Các bước setup

#### Bước 1: Đăng ký Cloudflare
1. Vào https://dash.cloudflare.com/sign-up
2. Đăng ký tài khoản miễn phí
3. Xác nhận email

#### Bước 2: Tạo Worker
1. Vào **Workers & Pages**
2. Bấm **"Create application"**
3. Chọn **"Create Worker"**
4. Đặt tên: `audio-proxy` (hoặc tên khác)
5. Bấm **"Deploy"**

#### Bước 3: Sửa code Worker
1. Bấm **"Edit Code"**
2. Xóa hết code mẫu
3. Dán code này vào:

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }
    
    // Kiểm tra chỉ cho phép Oxford và Cambridge
    const allowed = [
      'oxfordlearnersdictionaries.com',
      'dictionary.cambridge.org'
    ];
    const isAllowed = allowed.some(domain => targetUrl.includes(domain));
    
    if (!isAllowed) {
      return new Response('Domain not allowed', { status: 403 });
    }
    
    try {
      const response = await fetch(targetUrl);
      const newResponse = new Response(response.body, response);
      
      // Thêm CORS headers
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', '*');
      
      return newResponse;
    } catch (error) {
      return new Response('Fetch error: ' + error.message, { status: 500 });
    }
  }
};
```

4. Bấm **"Save and Deploy"**

#### Bước 4: Lấy link Worker
Sau khi deploy xong, copy link dạng:
```
https://audio-proxy.ten-ban.workers.dev
```

#### Bước 5: Cập nhật config.js
Thêm vào đầu file `config.js`:
```javascript
window.AUDIO_PROXY_URL = "https://audio-proxy.ten-ban.workers.dev";
```

#### Bước 6: Cập nhật app.js
Sửa hàm `fetchBytes()` để dùng Worker:

```javascript
async function fetchBytes(url) {
  if (window.AUDIO_PROXY_URL) {
    // Dùng Cloudflare Worker
    var proxyURL = window.AUDIO_PROXY_URL + "?url=" + encodeURIComponent(url);
    try {
      var response = await fetch(proxyURL);
      if (response.ok) {
        var buffer = await response.arrayBuffer();
        if (buffer.byteLength > 500) return buffer;
      }
    } catch (e) {
      console.error('Worker fetch failed:', e);
    }
  }
  
  // Fallback: Google Translate proxy (chậm hơn)
  if (url.indexOf("oxfordlearnersdictionaries.com") !== -1) {
    var gtp = "https://www-oxfordlearnersdictionaries-com.translate.goog" + 
      url.replace("https://www.oxfordlearnersdictionaries.com", "") + 
      "?_x_tr_sl=en&_x_tr_tl=fr&_x_tr_hl=en";
    try {
      var r = await fetch(gtp);
      if (r.ok) return await r.arrayBuffer();
    } catch (e) {}
  }
  
  return null;
}
```

---

## 7. DEPLOY LÊN GITHUB PAGES

### Bước 1: Tạo repository
1. Vào https://github.com/new
2. Tên repo: `joy-audio-tool`
3. Public
4. Bấm **"Create repository"**

### Bước 2: Upload code
```bash
cd joy-audio-tool
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Aliuliu001/joy-audio-tool.git
git push -u origin main
```

### Bước 3: Bật GitHub Pages
1. Vào **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Bấm **Save**

### Bước 4: Đợi deploy
Sau 2-3 phút, trang sẽ chạy ở:
```
https://aliuliu001.github.io/joy-audio-tool/
```

---

## 8. SỬA LỖI THƯỜNG GẶP

### Lỗi 1: Download ZIP không được

**Triệu chứng:**
- Bấm "Download zip" → không tải được
- Thông báo "Network blocked bulk download"

**Nguyên nhân:**
- Chưa setup Cloudflare Worker
- Link Worker sai

**Cách sửa:**
1. Kiểm tra `config.js` có `window.AUDIO_PROXY_URL` chưa
2. Test Worker bằng cách vào link:
   ```
   https://audio-proxy.ten-ban.workers.dev?url=https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/a/anc/ancho/anchor__gb_1.mp3
   ```
   Phải tải được file MP3

---

### Lỗi 2: Không tìm thấy từ (mà từ điển có)

**Triệu chứng:**
- Từ đơn giản như "hello" cũng không tìm thấy

**Nguyên nhân:**
- Oxford đổi cấu trúc URL

**Cách sửa:**
1. Vào Oxford Dictionary, tìm từ "hello"
2. Mở Developer Tools (F12) → Network tab
3. Play phát âm → tìm file MP3
4. Copy URL thực tế
5. So sánh với code `oxfordCandidates()` → sửa lại pattern

---

### Lỗi 3: Mã kích hoạt đúng mà báo sai

**Nguyên nhân:**
- `config.js` chưa cập nhật
- Cache trình duyệt

**Cách sửa:**
1. Xóa cache: Ctrl+Shift+Delete
2. Hard refresh: Ctrl+Shift+R
3. Kiểm tra `config.js` trên GitHub đã có mã tháng này chưa

---

### Lỗi 4: Nhập lại mã mỗi lần vào trang

**Nguyên nhân:**
- Trình duyệt chặn `sessionStorage`
- Dùng chế độ ẩn danh

**Cách sửa:**
- Tắt chế độ ẩn danh
- Cho phép cookies trong cài đặt trình duyệt

---

## 9. BẢO TRÌ HÀNG THÁNG

### Thay đổi mã kích hoạt

#### Cách 1: Sửa trực tiếp trên GitHub (khuyến khích)
1. Vào https://github.com/Aliuliu001/joy-audio-tool/blob/main/config.js
2. Bấm icon cây bút (Edit)
3. Thêm dòng mới:
   ```javascript
   "2027-09": "123456",
   ```
4. Bấm **"Commit changes"**
5. Đợi 1-2 phút → mã mới có hiệu lực

#### Cách 2: Dùng máy tính (nếu có code local)
```bash
cd joy-audio-tool
# Sửa file config.js
git add config.js
git commit -m "Update code tháng 9"
git push
```

---

## 10. NÂNG CẤP TRONG TƯƠNG LAI

### Tính năng có thể thêm
1. **Thêm từ điển khác:** Merriam-Webster, Collins
2. **Lưu lịch sử tìm kiếm:** LocalStorage
3. **Tạo flashcard:** Ghép ảnh + âm thanh
4. **Text-to-Speech backup:** Nếu không tìm thấy, dùng TTS
5. **Phiên âm IPA:** Hiển thị kí hiệu phiên âm

### API có thể dùng
- **Free Dictionary API:** https://dictionaryapi.dev/
- **Merriam-Webster API:** Cần đăng ký key miễn phí
- **Google TTS:** Dự phòng khi không có dictionary

---

## 11. CHECKLIST HOÀN THÀNH

Khi tạo lại app từ đầu, kiểm tra:

- [ ] Tạo 4 file: `index.html`, `app.js`, `config.js`, `sw.js`
- [ ] Thêm màu beige/brown theme
- [ ] Thêm mã kích hoạt tháng đầu tiên vào `config.js`
- [ ] Test tìm từ Oxford
- [ ] Test tìm từ Cambridge
- [ ] Setup Cloudflare Worker
- [ ] Thêm `AUDIO_PROXY_URL` vào `config.js`
- [ ] Test download ZIP
- [ ] Push lên GitHub
- [ ] Bật GitHub Pages
- [ ] Test trang web online
- [ ] Hard refresh (Ctrl+Shift+R) trước khi test
- [ ] Đưa link cho người dùng thử

---

## 12. LIÊN HỆ & HỖ TRỢ

**Repository:** https://github.com/Aliuliu001/joy-audio-tool  
**Website:** https://aliuliu001.github.io/joy-audio-tool/

**Người quản lý:** Ngọc Trương  
**Mục đích:** Công cụ hỗ trợ giảng dạy tiếng Anh

---

**Lưu ý cuối:** Tài liệu này đủ để bất kỳ ai có thể tạo lại app từ đầu. Giữ file này trong repo để tham khảo sau này!
