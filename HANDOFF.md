# BodyMetrics — Handoff (31/10/2026)

Tài liệu bàn giao để một AI/dev khác tiếp tục. Đọc kèm `CLAUDE.md` (quy ước code), `README.md` (cài đặt), `DEPLOY.md` (deploy + connector Claude).

## 1. Trạng thái hiện tại

- **Production:** https://bodymetrics-gamma.vercel.app — Vercel (Hobby) + Neon Postgres Free (Singapore). Bản mới nhất được deploy trực tiếp từ source local commit `afd37ab` ngày 31/10/2026 (deployment `dpl_DcCEu8JeSVVPHWW8jaqc8HNbCbhb`, trạng thái READY).
- **Deploy:** chưa bật auto-deploy từ GitHub (Vercel GitHub App chưa cài). Deploy bằng CLI: `npx vercel@65.7.0 deploy --prod --yes`; Vercel CLI đã đăng nhập và project `bodymetrics` đã link trong `.vercel/`.
- **Build trên Vercel:** script `vercel-build` = `tsx prisma/pre-push.ts && prisma db push --skip-generate && prisma db seed && next build`. `pre-push.ts` là bước chuyển đổi dữ liệu idempotent (single-user → multi-user, onboardedAt…).
- **Tính năng đã có:** đa tài khoản (admin/user, admin tạo tài khoản, bắt đổi mật khẩu lần đầu, admin "xem dữ liệu" chỉ đọc), onboarding 3 bước, ăn uống (kho 282 món Việt, tìm không dấu, chọn khẩu phần, "Ăn lại", chống lưu trùng), tập luyện (MET, set/rep, thư viện bài tập, tiến độ 1RM), cơ thể (cân nặng, số đo, ảnh tiến trình), phân tích (TDEE thích nghi, biểu đồ theo tuần), connector Claude OAuth 2.1 cá nhân (`/api/mcp`) và nhóm dùng chung (`/api/mcp/shared/<groupId>`). Mọi công cụ MCP nhận `profile_username` rõ ràng (ví dụ `bm_demo_an`), kiểm tra quyền theo user và trả username đã chọn. Phân tích ảnh/báo cáo mới dùng Claude Web connector; app không gọi Anthropic API.
- **GitHub chưa đồng bộ:** `main` local đang đi trước `origin/main` 7 commit; không push trong lượt này. Production đã được deploy trực tiếp từ local commit `afd37ab`.
- **Claude dùng chung nhiều hồ sơ:** mỗi user tự tham gia bằng mã; chủ nhóm kết nối một Claude account; công cụ MCP yêu cầu username hồ sơ tường minh và kiểm tra membership ở mỗi lần gọi. OAuth E2E local bao phủ hai user và username đích.

## 2. Việc đang làm dở (ưu tiên)

### 2.1 Ảnh bữa ăn và món trùng (đã sửa local, chưa kiểm tra production)
- Route `src/app/api/uploads/[...path]/route.ts` không redirect nữa: trả 401/404 cho request ảnh chưa xác thực/không thuộc user. Regression tests ở `scripts/upload-route.test.ts`.
- Chặn lưu món trùng y hệt trong cùng bữa; tests ở `scripts/meal-duplicates.test.ts`.
- Các thay đổi đã deploy cùng `afd37ab` (ban đầu commit local `026d510`, `a6cfe8d`). Không đăng nhập hoặc đọc/sửa nhật ký người dùng production; ảnh chưa được kiểm tra thủ công trên production.

### 2.2 Phân tích ảnh qua Claude Web connector
- Phân tích trực tiếp trong app đã được gỡ để không cần `ANTHROPIC_API_KEY`.
- Ảnh bữa ăn có thể lưu cùng nhật ký; ảnh đang chọn trong BodyMetrics không tự gửi sang Claude. Người dùng tải ảnh lên chat Claude, bật connector và nêu đúng `profile_username` để Claude đọc/lưu.
- Tạo báo cáo tuần mới cũng thực hiện trong chat Claude; các báo cáo cũ đã lưu vẫn hiển thị.
- Connector cá nhân dùng `/api/mcp`; nhóm dùng chung cần các user tham gia bằng mã trước khi chủ nhóm kết nối. `list_profiles` trả username BodyMetrics, mọi tool đọc/ghi/xóa yêu cầu `profile_username`; membership được kiểm tra lại cho từng thao tác. Mỗi thành viên có thể rời nhóm hoặc được gỡ.

### 2.3 Việc nhỏ còn treo
- Gỡ biến môi trường `MCP_TOKEN` trên Vercel (không còn dùng; CLI bị chặn quyền khi tự gỡ).
- Bật auto-deploy: Vercel → Settings → Git → Connect repo.
- Mật khẩu admin production và tài khoản `dunglt` đã lộ trong cuộc trò chuyện với AI trước → nên đổi.

## 3. Chạy local

```bash
cp .env.example .env      # điền AUTH_SECRET (32+ ký tự), AUTH_USERNAME, AUTH_PASSWORD
npm install
npm run db:up             # Postgres Docker cổng 5433
npm run setup             # pre-push + db push + seed
npm run dev
```
- Dữ liệu mẫu: `npx tsx prisma/demo-data.ts --yes --user=<username>`; xóa: `--clean`.
- Tạo/đặt lại tài khoản: `npm run user:set -- <user> <pass> [--admin]`.
- Kiểm tra: `npm run typecheck`, `npm run lint`, `npm run build`, `npx tsx scripts/check-calc.ts`, `node scripts/oauth-e2e.mjs` (khi dev server chạy; `BASE_URL`, `E2E_USER`).
- Windows: Docker Desktop đôi khi lỗi "Inference manager … dockerInference" sau khi máy ngủ → tắt Docker, đổi tên thư mục `%LOCALAPPDATA%\Docker\run`, bật lại. Không bấm "Reset to factory defaults".
- Git trên máy dùng `autocrlf`; khi sửa file bằng script hãy chuẩn hóa LF.

## 4. Kiến trúc nhanh

- Next.js 15 App Router + TS + Tailwind v4 + Prisma 6 + Postgres. Ảnh lưu trong bảng `ImageBlob` (WebP), nén trên trình duyệt trước khi tải (`src/lib/client-image.ts`) vì Vercel giới hạn 4,5 MB/request.
- Múi giờ: `src/instrumentation.ts` đặt `process.env.TZ = APP_TIMEZONE || "Asia/Ho_Chi_Minh"`.
- Auth: cookie `bm_session` (HS256, `AUTH_SECRET`), `src/middleware.ts` chặn mọi trang; `getViewer()` / `requireWriter()` / `requireAdmin()` trong `src/lib/auth/index.ts`. Mọi truy vấn dữ liệu cá nhân phải lọc `userId`.
- OAuth: `src/lib/oauth/*`, `src/app/oauth/authorize`, `src/app/api/oauth/*`, metadata `/.well-known/*`. Token chỉ lưu hash; refresh token xoay vòng.
- Admin: `src/app/(admin)/admin/**`, `src/lib/admin.ts`.
- Tính toán năng lượng: `src/lib/calc.ts` (BMR Mifflin-St Jeor, MET net, kẹp ở BMR, tốc độ thực tế), tổng hợp ngày `src/lib/summary.ts`.

## 5. Ghi chú môi trường làm việc trước
- Các worktree cũ của các phiên AI con nằm trong `.claude/worktrees/` (đã gộp hết vào `main`; có thể xóa). Các database thử local: `bodymetrics_admin`, `bodymetrics_oauth`, `bodymetrics_meals`, `bodymetrics_onboard`, `bodymetrics_workouts`, `bodymetrics_polish` trong container Docker `db`.
- `.env.production.local` (không commit) chứa giá trị production đã đặt lên Vercel.
