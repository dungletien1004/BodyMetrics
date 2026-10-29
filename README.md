# BodyMetrics

Ứng dụng web cá nhân theo dõi quá trình giảm cân: nhật ký ăn uống (chụp ảnh để AI ước lượng calo), tập gym/cardio (tính calo theo MET), cân nặng, số đo, ảnh tiến trình, và phân tích theo tuần.

## Cài đặt

Cần Node.js 20 trở lên.

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Trước khi chạy, điền `AUTH_SECRET` (chuỗi ngẫu nhiên 32+ ký tự), `AUTH_USERNAME` và `AUTH_PASSWORD` trong `.env`. Tài khoản này được tạo ở lần đăng nhập đầu tiên; sau đó đổi mật khẩu trong **Hồ sơ**, hoặc dùng `npm run user:set -- <tên> <mật-khẩu>`.

Mở http://localhost:3000, đăng nhập, rồi vào **Hồ sơ** nhập chiều cao, năm sinh, cân nặng và mục tiêu.

Để dùng tính năng phân tích ảnh món ăn và báo cáo tuần, điền `ANTHROPIC_API_KEY` trong `.env`.

### Dữ liệu mẫu (tùy chọn)

Muốn xem thử biểu đồ trước khi có dữ liệu thật:

```bash
npx tsx prisma/demo-data.ts --yes
```

Xóa dữ liệu mẫu (chỉ xóa các dòng có ghi chú `[demo]`):

```bash
npx tsx prisma/demo-data.ts --clean
```

## Dùng trên điện thoại

Chạy `npm run dev -- -H 0.0.0.0` rồi mở địa chỉ IP của máy tính từ điện thoại (cùng mạng Wi-Fi). Có thể "Thêm vào màn hình chính" để dùng như app.

## Deploy và kết nối với Claude

Xem [DEPLOY.md](DEPLOY.md): chạy bằng Docker trên Railway (hoặc host bất kỳ có volume), rồi thêm BodyMetrics làm connector trong claude.ai. Khi đó bạn gửi ảnh bữa ăn hoặc buổi tập cho Claude bằng tài khoản Claude của mình, Claude phân tích và tự lưu vào app.

## Dữ liệu

- Cơ sở dữ liệu: `prisma/dev.db` (SQLite)
- Ảnh: thư mục `uploads/`

Sao lưu hai mục trên là đủ giữ toàn bộ dữ liệu.

## Cách tính

- **BMR** theo Mifflin-St Jeor; **tiêu hao cơ bản** = BMR × hệ số vận động thường ngày.
- **Calo buổi tập** = (MET × hệ số cường độ − 1) × kg × giờ, đã trừ phần nghỉ ngơi đã tính trong BMR.
- **Mục tiêu ăn** = tiêu hao cơ bản + calo tập hôm đó − thâm hụt mong muốn, không thấp hơn BMR.
- **TDEE thích nghi**: sau 2–4 tuần, ước lượng từ lượng ăn trung bình và xu hướng cân nặng (7.700 kcal ≈ 1 kg).

Các con số chỉ mang tính tham khảo, không thay thế tư vấn y tế hoặc dinh dưỡng chuyên môn.
