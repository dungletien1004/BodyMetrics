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

Mở http://localhost:3000. Vào **Hồ sơ** nhập chiều cao, năm sinh, cân nặng và mục tiêu trước.

Để dùng tính năng phân tích ảnh món ăn và báo cáo tuần, điền `ANTHROPIC_API_KEY` trong `.env`.

## Dùng trên điện thoại

Chạy `npm run dev -- -H 0.0.0.0` rồi mở địa chỉ IP của máy tính từ điện thoại (cùng mạng Wi-Fi). Có thể "Thêm vào màn hình chính" để dùng như app.

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
