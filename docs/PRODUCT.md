# Accelerate Reading: bối cảnh nghiệp vụ

> Tóm tắt các quyết định đã chốt khi thảo luận và xây dựng MVP. Đọc file này trước khi làm việc tiếp.

## 1. Mục tiêu sản phẩm

Đây là web app **cá nhân** (một người dùng) giúp đọc tài liệu kỹ thuật công nghệ:
- **nhanh hơn**;
- **hiểu nhanh hơn**;
- **tóm tắt và nhớ** được để **trình bày lại** cho người khác.

| Thông số | Đã chốt |
|---|---|
| Người dùng | Người đi làm, đọc nhiều tài liệu kỹ thuật |
| Ngôn ngữ nội dung | Tiếng Anh, tiếng Việt **và** tiếng Trung |
| Ngôn ngữ giao diện | **Tiếng Anh** |
| Nền tảng | Website, chạy trên máy cá nhân |
| Triết lý | **Áp dụng khoa học** (khoa học nhận thức, khoa học thần kinh về đọc), trung thực, không hứa kiểu "đọc 1000 từ/phút" |

## 2. Nền tảng khoa học (lý do của từng tính năng)

**Những gì đã bị bác bỏ, không được làm:**
- **RSVP (hiện từng từ một)**, kiểu Spritz hay Spreeder: chặn việc mắt quay lại đọc lại (regressions, chiếm khoảng 10–15% chuyển động mắt), nên hiểu bài giảm.
- **Bionic Reading:** các thử nghiệm độc lập không thấy lợi ích.
- **"Bỏ đọc thầm", "mở rộng tầm mắt đọc cả dòng":** trái với giới hạn sinh lý. Mỗi lần mắt dừng (khoảng 200–250ms) chỉ thấy rõ khoảng 7–8 ký tự (Rayner và cộng sự, 2016).
- **Game luyện não chung** như Lumosity: hiệu quả không chuyển sang kỹ năng đọc.

**Những gì có bằng chứng, nên làm:**
- **Kiến thức nền và gom cụm (chunking):** người có kiến thức nền đọc nhanh hơn. Đây là cơ sở của bước xem trước.
- **Information Foraging (Pirolli & Card):** đọc có mục đích, quét cấu trúc trước rồi mới đào sâu. Đây là cơ sở của bước đặt mục đích.
- **Retrieval practice (Roediger & Karpicke, 2006):** tự nhớ lại hiệu quả hơn hẳn đọc lại. Đây là cơ sở của bước viết tóm tắt từ trí nhớ.
- **Self-explanation (Chi) và kỹ thuật Feynman:** dùng cho chế độ trình bày ở giai đoạn 2.
- **Spaced repetition (thuật toán FSRS):** dùng cho flashcard ở giai đoạn 2.
- **Đánh đổi tốc độ và hiểu bài là có thật:** kỹ năng cần luyện là chọn lúc nào đọc lướt (skim), lúc nào đọc kỹ (deep).

**Khoảng trống thị trường:** các app đọc nhanh thì nhiều nhưng khoa học yếu. App có cơ sở khoa học (Fast ForWord, Lexia, Amira…) thì chủ yếu dành cho trẻ em và người khó đọc. Chưa có app nào làm nghiêm túc cho **người lớn đọc tài liệu kỹ thuật**, và gần như không có cho **tiếng Việt**.

## 3. Vòng luyện một phiên đọc (đã làm ở MVP)

1. **Preview:** chỉ hiện heading và câu đầu của mỗi phần (hoặc mục đầu của danh sách), có bấm giờ, kèm ô "bạn đoán bài nói gì" (tùy chọn).
2. **Purpose:** viết câu hỏi cần trả lời và chọn chế độ `skim` hoặc `deep`. Có thể bật **pacer**: tô sáng từng cụm 3 từ theo tốc độ đặt trước, nhưng **vẫn hiện toàn bộ bài**, khác RSVP. Tốc độ gợi ý là trung vị của 5 phiên gần nhất trong cùng ngôn ngữ.
3. **Read:** bấm giờ, tự dừng khi chuyển tab, có nút tạm dừng. Câu hỏi được **tạo sẵn trong lúc đọc**.
4. **Recall:** ẩn bài, viết tóm tắt từ trí nhớ "như đang báo cáo cho đồng nghiệp".
5. **Check:** 5 câu trắc nghiệm do AI tạo: 2 câu về ý chính, 2 câu về cơ chế (how/why), 1 câu suy luận hoặc áp dụng.
6. **Results:** tốc độ, % hiểu bài, tốc độ hiệu quả, điểm nhớ lại. AI nhận xét các ý đã nắm, ý bị thiếu, chỗ hiểu sai, và bản tóm tắt có trả lời được câu hỏi mục đích không. Có phần xem lại đáp án.

Nếu không có AI key, app vẫn đo tốc độ và lưu bản tóm tắt, chỉ bỏ phần câu hỏi và nhận xét.

## 4. Chỉ số

- **Speed:** số từ chia cho số phút đọc. Tiếng Anh tính bằng **từ/phút**. Tiếng Việt tính bằng **âm tiết (tiếng)/phút**, vì mỗi chữ cách nhau bằng dấu cách là một âm tiết. Tiếng Trung tính bằng **chữ (字)/phút**, vì tiếng Trung không có dấu cách giữa các từ. Các ngôn ngữ **luôn được theo dõi riêng**, không so sánh chéo.
- **Comprehension:** tỷ lệ trả lời đúng quiz.
- **Effective speed = Speed × Comprehension.** Đây là **chỉ số chính**: đọc nhanh mà không hiểu thì không được tính.
- **Recall score (0–100):** điểm AI chấm bản tóm tắt.
- **Trang Progress:** trung bình 5 phiên gần nhất so với 5 phiên đầu, biểu đồ xu hướng và bảng lịch sử.

## 5. Quyết định kỹ thuật

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Framework | Next.js 16 (App Router, Cache Components bật) + TypeScript + Tailwind 4 | Web, một codebase |
| Cơ sở dữ liệu | **SQLite** qua Drizzle ORM và `@libsql/client`, file `data/reading.db`, tự migrate khi chạy | Dùng một mình, đơn giản, sao lưu bằng cách copy file. Có thể chuyển sang Turso nếu cần dùng nhiều thiết bị |
| Đăng nhập | **Không có** | Dùng cá nhân |
| AI | Vercel AI SDK v7, **không phụ thuộc một nhà cung cấp**: `google`, `anthropic`, `openai`, `deepseek`, `ollama`, `openai-compatible` | Đổi nhà cung cấp chỉ bằng biến môi trường |
| AI đang dùng | **DeepSeek** (`AI_PROVIDER=deepseek`, model `deepseek-v4-flash`) | Rẻ. Provider riêng `@ai-sdk/deepseek` đưa JSON schema vào prompt nên kết quả ổn định |
| Nhập URL | `@mozilla/readability` + `linkedom` | Lấy phần nội dung chính, bỏ menu và footer |
| Font đọc | Literata (tiếng Trung dùng font Song/Ming của hệ thống) | Thiết kế cho đọc lâu trên màn hình, hỗ trợ tiếng Việt |

## 6. Trạng thái hiện tại

- MVP đã xong, nằm trên nhánh `claude/reading-ability-app-r384vp`.
- Đã kiểm thử end-to-end bằng AI giả lập. **Chưa kiểm thử với DeepSeek thật**: việc cần làm đầu tiên là chạy một phiên đến bước Check.
- Đã sửa hai lỗi:
  - cảnh báo hydration ở `<html>` do tiện ích trình duyệt chèn class, sửa bằng `suppressHydrationWarning`;
  - cảnh báo khi điều hướng do dữ liệu tải ngoài `Suspense`, sửa bằng `loading.tsx` cho từng trang.

## 7. Lộ trình tiếp theo

- **Giai đoạn 2:**
  - **Chế độ trình bày:** "giải thích bài trong 60 giây" theo cấu trúc kết luận trước, gồm 1 thông điệp chính và 3 luận điểm. AI nhận xét độ rõ ràng, đầy đủ, chính xác.
  - **Flashcard tự sinh** cho thuật ngữ và ý chính, ôn theo FSRS. Đo tỷ lệ còn nhớ sau 1 ngày và 7 ngày.
  - **Từ điển thuật ngữ song ngữ Anh–Việt** có ôn ngắt quãng.
- **Giai đoạn 3:**
  - bài luyện tìm thông tin nhanh ("tìm cách cấu hình X trong 30 giây");
  - dashboard nâng cao;
  - tiện ích trình duyệt;
  - nhập PDF.
- **Ý tưởng để sau:** theo dõi mắt qua webcam; dùng embedding (`bge-m3`, `multilingual-e5`) để chấm sơ bộ bản tóm tắt cho rẻ hơn; chạy Ollama cho tài liệu nội bộ cần bảo mật.

## 8. Lưu ý vận hành

- **Cần Node.js 22 trở lên** (AI SDK v7 yêu cầu).
- Cài thư viện bằng `npm ci`. **Không chạy `npm audit fix --force`**: lệnh này hạ `drizzle-kit` xuống 0.18 và làm hỏng dự án. Các cảnh báo audit còn lại chỉ thuộc công cụ phát triển (`drizzle-kit`, `eslint`), không ảnh hưởng app.
- File `.env.local` (không commit) chứa `AI_PROVIDER` và API key. Mẫu xem ở `.env.example`.
- Sửa `src/db/schema.ts` xong thì chạy `npm run db:generate` để tạo migration.
- Next.js 16 khác nhiều so với các bản cũ: đọc `node_modules/next/dist/docs/` trước khi viết code (xem `AGENTS.md`).
