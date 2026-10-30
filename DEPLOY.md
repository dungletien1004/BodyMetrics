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
| `ANTHROPIC_API_KEY` | Tùy chọn, để phân tích ảnh ngay trong app |

File `.env.production.local` trên máy đã có sẵn giá trị ngẫu nhiên cho `AUTH_SECRET` và `AUTH_PASSWORD`. Nếu file còn dòng `MCP_TOKEN` thì bỏ đi, không dùng nữa.

Múi giờ mặc định là `Asia/Ho_Chi_Minh` (đặt trong code, đổi bằng `APP_TIMEZONE` nếu cần).

## 4. Deploy

**Deployments → Redeploy** (hoặc push lên `main`). Lệnh build `vercel-build` tự tạo bảng trong database, nạp thư viện bài tập rồi build app. Địa chỉ có dạng `https://bodymetrics-xxx.vercel.app`.

Đăng nhập bằng `AUTH_USERNAME` / `AUTH_PASSWORD`, rồi đổi mật khẩu trong **Hồ sơ**.

Từ đó, mỗi lần push lên `main` Vercel tự deploy lại; dữ liệu trong Neon giữ nguyên.

## 5. Kết nối với Claude (claude.ai)

Mỗi người dùng tự kết nối Claude của mình bằng tài khoản BodyMetrics riêng (OAuth), không cần token bí mật.

1. Trên claude.ai: **Settings → Connectors → Add custom connector**.
2. Tên: `BodyMetrics`. URL: `https://<địa-chỉ-app>/api/mcp` (cũng hiện trong **Hồ sơ → Kết nối Claude**, có nút sao chép). Bấm **Add**, rồi **Connect**.
3. Claude mở trang đăng nhập BodyMetrics. Đăng nhập, xem các quyền rồi bấm **Cho phép**. Claude quay lại claude.ai và connector đã sẵn sàng.
4. Trong cuộc trò chuyện, bật connector BodyMetrics, gửi ảnh bữa ăn hoặc ảnh buổi tập và nói ví dụ "ghi bữa trưa này". Claude sẽ phân tích, lưu vào tài khoản của bạn và báo lại lượng calo còn lại trong ngày.

Claude nhận token truy cập 1 giờ, tự gia hạn bằng refresh token (30 ngày, đổi mới sau mỗi lần dùng). Muốn ngắt kết nối: **Hồ sơ → Kết nối Claude → Thu hồi** (hoặc gỡ connector trên claude.ai). Tài khoản bị khóa thì mọi kết nối của nó ngừng hoạt động ngay.

Endpoint cho ai cần kiểm tra: metadata ở `/.well-known/oauth-authorization-server` và `/.well-known/oauth-protected-resource/api/mcp`; đăng ký client động `/api/oauth/register` (hoặc client_id là URL của Client ID Metadata Document); `/oauth/authorize`, `/api/oauth/token`, `/api/oauth/revoke`. Chạy thử toàn bộ luồng: `node scripts/oauth-e2e.mjs` khi `npm run dev` đang chạy.

## Sao lưu

Neon giữ lịch sử để khôi phục trong 6 giờ gần nhất ở gói Free. Muốn sao lưu đầy đủ: `pg_dump "$DATABASE_URL_UNPOOLED" > backup.sql`.
