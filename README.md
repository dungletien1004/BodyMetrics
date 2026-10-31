# BodyMetrics

Ứng dụng web cá nhân theo dõi quá trình giảm cân: nhật ký ăn uống (đính kèm ảnh bữa ăn), tập gym/cardio (tính calo theo MET), cân nặng, số đo, ảnh tiến trình và phân tích theo tuần. Có thể kết nối Claude Web để phân tích ảnh và thao tác dữ liệu qua connector.

## Cài đặt

Cần Node.js 20 trở lên và Docker (để chạy Postgres trên máy).

```bash
cp .env.example .env
npm install
npm run db:up
npm run setup
npm run dev
```

Trước khi chạy, điền `AUTH_SECRET` (chuỗi ngẫu nhiên 32+ ký tự), `AUTH_USERNAME` và `AUTH_PASSWORD` trong `.env`. Tài khoản này được tạo ở lần đăng nhập đầu tiên; sau đó đổi mật khẩu trong **Hồ sơ**, hoặc dùng `npm run user:set -- <tên> <mật-khẩu>`.

Mở http://localhost:3000, đăng nhập, rồi vào **Hồ sơ** nhập chiều cao, năm sinh, cân nặng và mục tiêu.

Để dùng Claude phân tích ảnh, mở chat Claude đã bật BodyMetrics connector, tải ảnh lên trong chat và yêu cầu ghi kết quả vào đúng hồ sơ. Ảnh đang chọn trong app không tự gửi sang Claude; nếu muốn lưu ảnh cùng bữa ăn, hãy chọn ảnh trong form và nhấn **Lưu bữa ăn**.

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

Xem [DEPLOY.md](DEPLOY.md): deploy miễn phí lên Vercel với database Neon, rồi kết nối BodyMetrics với Claude. Mỗi người có thể kết nối tài khoản riêng; nhiều tài khoản BodyMetrics cũng có thể tự tham gia một nhóm để dùng chung một connector Claude. Mỗi lần thao tác, Claude gửi đúng username BodyMetrics để chọn hồ sơ và quyền vẫn được kiểm tra riêng.

## Dữ liệu

Toàn bộ dữ liệu, kể cả ảnh, nằm trong Postgres. Trên máy là container Docker `db` (`npm run db:up`); trên web là Neon.

## Cách tính

- **BMR** theo Mifflin-St Jeor; **tiêu hao cơ bản** = BMR × hệ số vận động thường ngày.
- **Calo buổi tập** = (MET × hệ số cường độ − 1) × kg × giờ, đã trừ phần nghỉ ngơi đã tính trong BMR.
- **Mục tiêu ăn** = tiêu hao cơ bản + calo tập hôm đó − thâm hụt mong muốn, không thấp hơn BMR.
- **TDEE thích nghi**: sau 2–4 tuần, ước lượng từ lượng ăn trung bình và xu hướng cân nặng (7.700 kcal ≈ 1 kg).

Các con số chỉ mang tính tham khảo, không thay thế tư vấn y tế hoặc dinh dưỡng chuyên môn.
