# Deploy BodyMetrics lên web

App chạy bằng Docker. Dữ liệu (database SQLite và ảnh) nằm trong thư mục `/data`, nên nơi chạy phải có **ổ lưu trữ cố định (volume)** gắn vào `/data`. Không có volume thì mỗi lần deploy lại sẽ mất hết dữ liệu.

Khuyến nghị: **Railway** (khoảng 5 USD/tháng, có volume, HTTPS và tên miền miễn phí).

## 1. Biến môi trường

File `.env.production.local` trong máy đã có sẵn giá trị ngẫu nhiên cho bạn (file này không được commit). Đặt các biến sau ở nơi deploy:

| Biến | Ý nghĩa |
|---|---|
| `AUTH_SECRET` | Khóa ký cookie đăng nhập, 32+ ký tự ngẫu nhiên |
| `AUTH_USERNAME`, `AUTH_PASSWORD` | Tài khoản được tạo ở lần đăng nhập đầu tiên. Sau đó đổi mật khẩu trong **Hồ sơ** |
| `MCP_TOKEN` | Phần bí mật trong URL connector cho Claude |
| `TZ` | `Asia/Ho_Chi_Minh` (đã đặt sẵn trong image) |
| `ANTHROPIC_API_KEY` | Tùy chọn, để phân tích ảnh ngay trong app |

`DATABASE_URL`, `UPLOAD_DIR`, `PORT` đã có mặc định trong image, không cần đặt.

## 2. Railway

1. Đăng nhập https://railway.com bằng GitHub.
2. **New Project → Deploy from GitHub repo** → chọn repo `BodyMetrics`. Railway tự nhận `Dockerfile`.
3. Trong service: **Settings → Volumes → Add Volume**, mount path `/data`.
4. **Variables**: dán các dòng từ `.env.production.local`.
5. **Settings → Networking → Generate Domain** để có địa chỉ `https://...up.railway.app`.
6. **Settings → Deploy → Healthcheck Path**: `/api/health`.

Mỗi lần push lên nhánh `main`, Railway tự build và deploy lại; dữ liệu trong volume được giữ nguyên.

## 3. Kết nối với Claude (claude.ai)

1. Trên claude.ai: **Settings → Connectors → Add custom connector**.
2. Tên: `BodyMetrics`. URL: `https://<tên-miền-của-bạn>/api/mcp/<MCP_TOKEN>`.
3. Trong cuộc trò chuyện, bật connector BodyMetrics, gửi ảnh bữa ăn hoặc ảnh buổi tập và nói ví dụ "ghi bữa trưa này". Claude sẽ phân tích và lưu vào app, rồi báo lại lượng calo còn lại trong ngày.

Coi toàn bộ URL connector như mật khẩu: ai có URL đều ghi được dữ liệu. Muốn thu hồi, đổi `MCP_TOKEN` rồi cập nhật lại URL trong claude.ai.

## Nơi khác (Fly.io, VPS…)

Bất kỳ nơi nào chạy được Docker và có volume:

```bash
docker build -t bodymetrics .
docker run -d -p 3000:3000 -v bodymetrics-data:/data --env-file .env.production.local bodymetrics
```

Cần đặt app sau HTTPS (cookie đăng nhập chỉ gửi qua HTTPS khi chạy production). Chỉ để thử qua `http://` thì thêm `AUTH_INSECURE_COOKIE=1`.

## Sao lưu

Sao lưu thư mục `/data` (file `bodymetrics.db` và thư mục `uploads/`). Trên Railway có thể bật backup cho volume.
