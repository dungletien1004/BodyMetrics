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

Có hai cách dùng connector. Cách cá nhân phù hợp khi mỗi người dùng có tài khoản Claude riêng. Nhóm dùng chung phù hợp khi nhiều hồ sơ BodyMetrics cần dùng cùng một tài khoản Claude.

### Kết nối cá nhân

1. Đăng nhập BodyMetrics, mở **Hồ sơ → Kết nối Claude**, rồi bấm **Mở Claude để kết nối**.
2. Trong Claude, mở **Customize → Connectors → Add custom connector**. Đặt tên `BodyMetrics`, dán URL cá nhân `/api/mcp` đang hiện trong hồ sơ, bấm **Add**, rồi **Connect**.
3. Đăng nhập bằng tài khoản BodyMetrics của bạn và bấm **Cho phép**.
4. Trong chat bật connector. Claude gọi `list_profiles` trước, rồi truyền đúng `profile_id` vào mọi thao tác đọc hoặc ghi.

### Nhiều hồ sơ dùng chung một tài khoản Claude

1. Chủ nhóm mở **Hồ sơ → Kết nối Claude**, tạo nhóm và gửi mã mời riêng cho từng người.
2. Mỗi người đăng nhập bằng tài khoản BodyMetrics của mình, nhập mã và bấm **Tham gia**. Khi tham gia, người đó đồng ý cho connector của nhóm đọc, ghi và xóa nhật ký trong hồ sơ của mình; xóa chỉ khi người dùng yêu cầu.
3. Sau khi các thành viên đã tham gia, chủ nhóm sao chép URL connector của nhóm (`/api/mcp/shared/<id>`), thêm URL đó vào cùng tài khoản Claude và cấp quyền bằng tài khoản BodyMetrics chủ nhóm. Trang cấp quyền liệt kê các hồ sơ trong nhóm.
4. Claude gọi `list_profiles` và phải chọn `profile_id` rõ ràng cho mỗi thao tác. Nếu chưa rõ hồ sơ nào, Claude cần hỏi. Khi thành viên rời nhóm hoặc bị gỡ, các lần gọi tiếp theo không còn truy cập được hồ sơ đó.

Claude nhận token truy cập 1 giờ, tự gia hạn bằng refresh token (30 ngày, đổi mới sau mỗi lần dùng). Muốn ngắt kết nối cá nhân: **Hồ sơ → Kết nối Claude → Thu hồi** (hoặc gỡ connector trên claude.ai). Chủ nhóm có thể xóa nhóm; thành viên có thể rời nhóm hoặc được chủ nhóm gỡ. Tài khoản bị khóa thì các kết nối do tài khoản đó tạo không hoạt động nữa.

Endpoint cho ai cần kiểm tra: metadata ở `/.well-known/oauth-authorization-server` và `/.well-known/oauth-protected-resource/api/mcp`; đăng ký client động `/api/oauth/register` (hoặc client_id là URL của Client ID Metadata Document); `/oauth/authorize`, `/api/oauth/token`, `/api/oauth/revoke`. Chạy thử toàn bộ luồng: `node scripts/oauth-e2e.mjs` khi `npm run dev` đang chạy.

## Sao lưu

Neon giữ lịch sử để khôi phục trong 6 giờ gần nhất ở gói Free. Muốn sao lưu đầy đủ: `pg_dump "$DATABASE_URL_UNPOOLED" > backup.sql`.
