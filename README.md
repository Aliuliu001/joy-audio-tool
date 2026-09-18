# 🔊 Joy Audio Tool

Trang web nội bộ của Joy: dán danh sách từ → tìm file phát âm Oxford
→ nghe thử → tải gộp 1 file zip.

Link dùng chung: **https://aliuliu001.github.io/joy-audio-tool/**

## Đổi mã hàng tháng (30 giây, làm trên điện thoại cũng được)

1. Mở `config.js` trong kho này → bấm cây bút chì ✏️ (Edit)
2. Tìm dòng tháng cần đổi, ví dụ `"2026-10": "JOY-T10"` → gõ mã mới
3. Bấm **Commit changes** → xong. Các cô dùng mã mới ngay, mã cũ tự hết hiệu lực.

## Cách hoạt động (cho người quản lý kỹ thuật)

- File phát âm lấy từ Oxford Learners Dictionaries (giọng UK/US thật).
- Trình duyệt tự đoán link file Oxford theo tên từ rồi kiểm tra — không cần máy chủ.
- Từ nào Oxford không có (cụm từ, từ hiếm) → tự dùng giọng Google đọc thay, có ghi chú rõ.
- Nút "Download zip" lấy audio qua Cloudflare Worker rồi gom thành 1 file zip. File nào lỗi vẫn có link `download` riêng ngay cạnh từ đó.
- Mã tháng chỉ là lớp khóa đơn giản (nằm trong `config.js`), đủ để người ngoài không tự dùng được.

## Bật tải file ZIP (cần làm một lần)

GitHub Pages không thể tự đọc file audio từ Oxford/Cambridge do trình duyệt chặn CORS. Deploy `audio-proxy-worker.js` lên Cloudflare Workers, sau đó dán URL Worker vào `window.AUDIO_PROXY_URL` trong `config.js`.

Ví dụ URL cần dán: `https://joy-audio-proxy.<your-subdomain>.workers.dev`

Worker chỉ chấp nhận các URL audio của Oxford Learner's Dictionaries và Cambridge Dictionary; nó không phải open proxy.
