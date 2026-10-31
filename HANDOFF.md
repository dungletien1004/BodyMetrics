# BodyMetrics — Handoff (31/10/2026)

Tài liệu bàn giao để một AI/dev khác tiếp tục. Đọc kèm `CLAUDE.md` (quy ước code), `README.md` (cài đặt), `DEPLOY.md` (deploy + connector Claude).

## 1. Trạng thái hiện tại

- **Production:** https://bodymetrics-gamma.vercel.app — Vercel (Hobby) + Neon Postgres Free (Singapore). Deploy gần nhất: commit `9aa1a39` trên `main` (đã push lên `github.com/dungletien1004/BodyMetrics`).
- **Deploy:** chưa bật auto-deploy từ GitHub (Vercel GitHub App chưa cài). Deploy bằng CLI từ máy: `npx vercel@65.7.0 deploy --prod --yes` (máy đã `vercel login` tài khoản `dungletien1004`, project `bodymetrics` đã link trong `.vercel/`).
- **Build trên Vercel:** script `vercel-build` = `tsx prisma/pre-push.ts && prisma db push --skip-generate && prisma db seed && next build`. `pre-push.ts` là bước chuyển đổi dữ liệu idempotent (single-user → multi-user, onboardedAt…).
- **Tính năng đã có:** đa tài khoản (admin/user, admin tạo tài khoản, bắt đổi mật khẩu lần đầu, admin "xem dữ liệu" chỉ đọc), onboarding 3 bước, ăn uống (kho 282 món Việt, tìm không dấu, chọn khẩu phần, "Ăn lại", chống lưu trùng), tập luyện (MET, set/rep, thư viện bài tập, tiến độ 1RM), cơ thể (cân nặng, số đo, ảnh tiến trình), phân tích (TDEE thích nghi, biểu đồ theo tuần, báo cáo tuần AI), connector Claude qua OAuth 2.1 (MCP tại `/api/mcp`).

## 2. Việc đang làm dở (ưu tiên)

### 2.1 Bug: ảnh bữa ăn mất sau khi lưu (chỉ xảy ra trên production)
- Người dùng `dunglt` (tạo bởi admin) tải ảnh, lưu bữa; trang `/meals/[id]` hiện khung ảnh vỡ (alt "Ảnh bữa ăn"). Bữa ăn có Photo row (nên khung mới hiện) nhưng `/api/uploads/<blobId>` không trả ảnh.
- **Trên local không tái hiện được**: cùng luồng (tìm món → chọn ảnh → Lưu, không có API key) trả 200 `image/webp`.
- Giả thuyết đang kiểm tra:
  1. `src/app/api/uploads/[...path]/route.ts` gọi `getViewer()` → `requireUser()`; `requireUser` (`src/lib/auth/index.ts:50-51`) **redirect sang `/doi-mat-khau` khi `mustChangePassword` = true** và redirect `/login` khi không có user. Trong route handler, redirect làm request ảnh trả 307 → ảnh vỡ. Kiểm tra cờ `mustChangePassword` của `dunglt`, và nên đổi route ảnh sang `getCurrentUser()` + tự xử lý view-as, trả 401/404 thay vì redirect.
  2. Blob thuộc user khác (`readImage(id, viewer.userId)` lọc theo owner).
  3. Bản Hobby không giữ log runtime cũ; để chẩn đoán: mở trực tiếp `https://bodymetrics-gamma.vercel.app/api/uploads/<blobId>` khi đang đăng nhập `dunglt` và xem status, hoặc chạy `npx vercel@65.7.0 logs --follow` trong lúc tái hiện.
- Cũng xem vì sao bữa đó có **2 dòng "Gỏi cuốn" giống hệt** (có thể do bấm thêm món 2 lần — nên cân nhắc gộp/hỏi khi thêm trùng).

### 2.2 Yêu cầu tính năng của người dùng
1. **Nút "Phân tích bằng AI" khi tải ảnh món ăn** — code đã có sẵn (`analyzePhoto` trong `src/app/(app)/meals/actions.ts`, `src/lib/ai/food.ts`) nhưng chỉ hiện khi có `ANTHROPIC_API_KEY`. **Production chưa có key.** Người dùng cần tạo key ở console.anthropic.com (trả phí theo lượt, ~0,01–0,03 USD/ảnh với `claude-opus-5-5`; rẻ hơn nhiều nếu đổi `AI_MODEL` trong `src/lib/ai/client.ts` sang `claude-haiku-5-5`) rồi tự thêm vào Vercel → Settings → Environment Variables → redeploy. Lưu ý: kết nối claude.ai (connector) **không** cho app dùng AI bên trong app — gói claude.ai không gọi được API từ server.
2. **AI cho bài tập**: chụp màn hình máy tập / ghi chú số set → AI tự nhận bài, set, rep, kg, phút và lưu (thay vì chọn bài nhập tay). Chưa làm. Gợi ý: thêm `src/lib/ai/workout.ts` tương tự `food.ts` (structured output: entries[{exercise_name khớp thư viện qua `visibleExercises`, minutes, intensity, sets[{reps, weight_kg}], distance_km}], kcal_override nếu ảnh đồng hồ có kcal), server action trong `src/app/(app)/workouts/actions.ts`, nút "Phân tích ảnh" ở đầu `workout-builder.tsx` điền sẵn builder để người dùng xác nhận rồi lưu. Cần `ANTHROPIC_API_KEY`.
3. Trong lúc chưa có API key: dùng AI qua **claude.ai** — bật connector BodyMetrics trong chat, gửi ảnh và nói "ghi bữa trưa này" / "ghi buổi tập này". Công cụ MCP `log_meal`, `log_workout`, `log_body`… (`src/lib/mcp/server.ts`) đã ghi được, nhưng không lưu file ảnh. Người dùng báo "đã kết nối nhưng chưa dùng được AI" — cần xác nhận họ dùng trong chat claude.ai (bật connector ở nút "+"/tools), và `dùng gần nhất` trong Hồ sơ → Kết nối Claude có cập nhật khi gọi công cụ.

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
