# Deploy BodyMetrics lên web

App chạy bằng Docker. Dữ liệu (database SQLite và ảnh) nằm trong thư mục `/data`, nên nơi chạy phải có **ổ lưu trữ cố định (disk/volume)** gắn vào `/data`. Không có ổ này thì mỗi lần deploy lại sẽ mất hết dữ liệu.

Khuyến nghị: **Render**. Repo đã có sẵn `render.yaml`, Render tự tạo service, ổ đĩa và biến môi trường. Chi phí khoảng 7 USD/tháng (gói Starter, bắt buộc để có ổ đĩa) cộng 0,25 USD/GB ổ đĩa.

## 1. Render (Blueprint)

1. Đăng nhập https://dashboard.render.com bằng GitHub, cho phép Render đọc repo `BodyMetrics`.
2. **New → Blueprint** → chọn repo `BodyMetrics` → Render đọc `render.yaml`.
3. Render hỏi `ANTHROPIC_API_KEY`: để trống nếu chưa có.
4. Bấm **Apply**. Render tạo service `bodymetrics` ở Singapore, ổ `/data` 1 GB, tự sinh `AUTH_SECRET`, `AUTH_PASSWORD` và `MCP_TOKEN`, rồi build và deploy.
5. Địa chỉ app có dạng `https://bodymetrics-xxxx.onrender.com`. Mật khẩu lần đầu nằm ở service → **Environment** → `AUTH_PASSWORD`. Đăng nhập bằng `admin` và mật khẩu đó, rồi đổi mật khẩu trong **Hồ sơ**.

Mỗi lần push lên nhánh `main`, Render tự build và deploy lại; dữ liệu trên ổ `/data` được giữ nguyên.

## 2. Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `AUTH_SECRET` | Khóa ký cookie đăng nhập, 32+ ký tự ngẫu nhiên (Render tự sinh) |
| `AUTH_USERNAME`, `AUTH_PASSWORD` | Tài khoản được tạo ở lần đăng nhập đầu tiên. Sau đó đổi mật khẩu trong **Hồ sơ** |
| `MCP_TOKEN` | Phần bí mật trong URL connector cho Claude (Render tự sinh) |
| `ANTHROPIC_API_KEY` | Tùy chọn, để phân tích ảnh ngay trong app |

`DATABASE_URL`, `UPLOAD_DIR`, `PORT` và `TZ=Asia/Ho_Chi_Minh` đã có mặc định trong image.

## 3. Kết nối với Claude (claude.ai)

1. Trên Render, mở service → **Environment** → xem giá trị `MCP_TOKEN`.
2. Trên claude.ai: **Settings → Connectors → Add custom connector**.
3. Tên: `BodyMetrics`. URL: `https://<địa-chỉ-app>/api/mcp/<MCP_TOKEN>` (dán nguyên token, kể cả dấu `/`, `+`, `=` nếu có).
4. Trong cuộc trò chuyện, bật connector BodyMetrics, gửi ảnh bữa ăn hoặc ảnh buổi tập và nói ví dụ "ghi bữa trưa này". Claude sẽ phân tích, lưu vào app và báo lại lượng calo còn lại trong ngày.

Coi toàn bộ URL connector như mật khẩu: ai có URL đều ghi được dữ liệu. Muốn thu hồi, đổi `MCP_TOKEN` trên Render rồi cập nhật lại URL trong claude.ai.

## Nơi khác (Railway, Fly.io, VPS…)

Bất kỳ nơi nào chạy được Docker và có volume gắn vào `/data`:

```bash
docker build -t bodymetrics .
docker run -d -p 3000:3000 -v bodymetrics-data:/data --env-file .env.production.local bodymetrics
```

File `.env.production.local` trên máy đã có sẵn các giá trị ngẫu nhiên. Cần đặt app sau HTTPS (cookie đăng nhập chỉ gửi qua HTTPS khi chạy production). Chỉ để thử qua `http://` thì thêm `AUTH_INSECURE_COOKIE=1`.

## Sao lưu

Sao lưu thư mục `/data` (file `bodymetrics.db` và thư mục `uploads/`). Render tự chụp snapshot ổ đĩa mỗi ngày và giữ 7 ngày.
