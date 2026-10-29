# Deploy BodyMetrics lên web (miễn phí)

App chạy trên **Vercel** (gói Hobby, miễn phí, không cần thẻ) với database **Neon Postgres** (gói Free). Ảnh được lưu trong database, nên không cần ổ đĩa riêng.

Giới hạn của gói miễn phí: Neon Free có 0,5 GB, đủ cho vài nghìn ảnh đã nén cùng toàn bộ nhật ký. Lần mở đầu tiên sau một thời gian dài không dùng có thể chậm vài giây vì database "ngủ".

## 1. Tạo project trên Vercel

1. Đăng nhập https://vercel.com bằng GitHub.
2. **Add New → Project** → chọn repo `BodyMetrics` → **Import**. Chưa bấm Deploy vội nếu Vercel cho phép; nếu lỡ deploy, lần đầu sẽ lỗi vì thiếu database, không sao.

## 2. Thêm database Neon

1. Trong project: **Storage → Create Database → Neon (Serverless Postgres)** → gói **Free** → tạo và **Connect** với project.
2. Vercel tự thêm `DATABASE_URL` và `DATABASE_URL_UNPOOLED` vào biến môi trường.

## 3. Biến môi trường

**Settings → Environment Variables**, thêm cho môi trường Production:

| Biến | Giá trị |
|---|---|
| `AUTH_SECRET` | Chuỗi ngẫu nhiên 32+ ký tự |
| `AUTH_USERNAME` | `admin` (hoặc tên bạn muốn) |
| `AUTH_PASSWORD` | Mật khẩu đăng nhập lần đầu |
| `MCP_TOKEN` | Chuỗi ngẫu nhiên 24+ ký tự, dùng cho connector Claude |
| `ANTHROPIC_API_KEY` | Tùy chọn, để phân tích ảnh ngay trong app |

File `.env.production.local` trên máy đã có sẵn giá trị ngẫu nhiên cho `AUTH_SECRET`, `AUTH_PASSWORD`, `MCP_TOKEN`.

Múi giờ mặc định là `Asia/Ho_Chi_Minh` (đặt trong code, đổi bằng `APP_TIMEZONE` nếu cần).

## 4. Deploy

**Deployments → Redeploy** (hoặc push lên `main`). Lệnh build `vercel-build` tự tạo bảng trong database, nạp thư viện bài tập rồi build app. Địa chỉ có dạng `https://bodymetrics-xxx.vercel.app`.

Đăng nhập bằng `AUTH_USERNAME` / `AUTH_PASSWORD`, rồi đổi mật khẩu trong **Hồ sơ**.

Từ đó, mỗi lần push lên `main` Vercel tự deploy lại; dữ liệu trong Neon giữ nguyên.

## 5. Kết nối với Claude (claude.ai)

1. Trên claude.ai: **Settings → Connectors → Add custom connector**.
2. Tên: `BodyMetrics`. URL: `https://<địa-chỉ-app>/api/mcp/<MCP_TOKEN>`.
3. Trong cuộc trò chuyện, bật connector BodyMetrics, gửi ảnh bữa ăn hoặc ảnh buổi tập và nói ví dụ "ghi bữa trưa này". Claude sẽ phân tích, lưu vào app và báo lại lượng calo còn lại trong ngày.

Coi toàn bộ URL connector như mật khẩu: ai có URL đều ghi được dữ liệu. Muốn thu hồi, đổi `MCP_TOKEN` trên Vercel, redeploy, rồi cập nhật lại URL trong claude.ai.

## Sao lưu

Neon giữ lịch sử để khôi phục trong 6 giờ gần nhất ở gói Free. Muốn sao lưu đầy đủ: `pg_dump "$DATABASE_URL_UNPOOLED" > backup.sql`.
