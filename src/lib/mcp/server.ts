import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { exerciseKcal, type Intensity } from "../calc";
import { isDayKey, shiftDay, todayKey } from "../dates";
import { db } from "../db";
import { getDaySummaries, getDaySummary, getProfile, getWeightOn } from "../summary";
import { deleteImage, imageAsJpegBase64 } from "../storage";
import {
  attachPhotos,
  deletePhotosOf,
  fetchImageFromUrl,
  linkPendingPhoto,
  photoPagePath,
  signUploadToken,
  UPLOAD_LINK_MINUTES,
  type PhotoTarget,
} from "../photos";

// Tools Claude (claude.ai connector) uses to read and write the user's log.
// Claude looks at the photo in the chat itself and sends the structured result here.

export const MCP_INSTRUCTIONS = `BodyMetrics là nhật ký giảm cân của người dùng (tiếng Việt). Dùng các công cụ này để ghi và đọc dữ liệu thật của họ.

- Trước mỗi thao tác, gọi list_profiles. Chọn theo username BodyMetrics mà người dùng nêu và truyền đúng profile_username (ví dụ bm_demo_an) vào mọi công cụ đọc/ghi/xóa. Nếu chưa rõ username nào, hỏi lại; không mặc định chủ nhóm hay đoán từ nội dung nhật ký. Không truyền profile_id thay cho username.
- Ảnh bữa ăn: nhận diện từng món, ước lượng gram, kcal, đạm, tinh bột, béo (tính cả dầu mỡ, nước sốt, đường trong đồ uống), rồi gọi log_meal. Tên món bằng tiếng Việt. Nếu không rõ bữa nào, đoán theo giờ (sáng < 10h, trưa 10-14h, tối 17-21h, còn lại ăn vặt).
- Ảnh/ghi chú buổi tập (ảnh màn hình đồng hồ, máy chạy, nhật ký gym): gọi list_exercises để tìm đúng tên bài tập, rồi log_workout. Nếu đồng hồ cho số kcal, truyền vào kcal_override.
- Ảnh cân hoặc số đo: gọi log_body.
- Ngày mặc định là hôm nay theo giờ của người dùng; chỉ truyền date (YYYY-MM-DD) khi họ nói ngày khác.
- Sau khi ghi, tóm tắt ngắn những gì đã lưu và lượng calo còn lại trong ngày (có trong kết quả trả về).
- Ảnh chụp trong BodyMetrics: khi người dùng nói đã chụp/lưu ảnh trong BodyMetrics (hoặc "ảnh mới", "ảnh vừa chụp"), gọi list_new_photos, rồi get_photo để xem từng ảnh, phân tích như trên và gọi log_meal (hoặc log_workout nếu là ảnh buổi tập) kèm photo_id để ảnh tự gắn. Mỗi ảnh chỉ dùng cho một bản ghi.
- Ảnh gửi trong chat Claude: sau khi log_meal / log_workout từ ảnh đó, LUÔN tự gắn ảnh vào bản ghi vừa lưu mà không cần hỏi: gọi attach_photo (meal_id hoặc workout_id) để lấy upload_url, rồi dùng công cụ chạy code (code execution) tải đúng file ảnh người dùng gửi lên upload_url theo lệnh trong kết quả. Kiểm tra phản hồi có "ok": true. Nếu không có công cụ chạy code hoặc bị chặn mạng, nói ngắn gọn người dùng bật "Code execution and file creation" và cho phép tên miền của BodyMetrics trong Settings → Capabilities, kèm link manual_url để tự gắn.
- Người dùng gửi link ảnh (http/https trực tiếp tới file ảnh): gọi attach_photo kèm image_url.
- Muốn gắn ảnh cho bữa ăn/buổi tập đã ghi: KHÔNG ghi lại. Lấy id từ get_day_summary rồi dùng attach_photo. Nếu ảnh đã lưu trong BodyMetrics (list_new_photos) thì truyền photo_id, ảnh gắn ngay, không cần chạy code.
- Nếu không tải được ảnh từ chat lên (không có công cụ chạy code hoặc mạng bị chặn): nói người dùng mở BodyMetrics, mục "Gửi ảnh cho Claude" ở trang Ăn uống, chọn lại ảnh đó, rồi nhắn bạn; khi đó dùng list_new_photos và attach_photo với photo_id.
- Chỉ xóa (delete_meal / delete_workout / delete_body_log) khi người dùng yêu cầu rõ ràng, ví dụ sửa một bản ghi vừa ghi nhầm. Không tự ý xóa để dọn dẹp hay ghi đè; nếu chưa chắc bản ghi nào, hỏi lại trước.
- Không đưa lời khuyên y khoa.`;

const day = z
  .string()
  .refine(isDayKey, "Ngày phải có dạng YYYY-MM-DD")
  .optional()
  .describe("YYYY-MM-DD; mặc định hôm nay");
const hhmm = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .describe("Giờ HH:mm; mặc định bây giờ");
const profileUsernameField = z
  .string()
  .min(1)
  .describe("Username BodyMetrics chính xác lấy từ list_profiles, ví dụ bm_demo_an; phải khớp hồ sơ người dùng yêu cầu");
const n = (max: number) => z.number().finite().min(0).max(max);

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * A personal token is scoped to one BodyMetrics user. A shared token is scoped to one group; a
 * member profile must be selected and membership is checked again for every tool call.
 */
type ToolContext = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

function authContext(ctx: ToolContext) {
  const extra = ctx.http?.authInfo?.extra;
  const userId = extra?.userId;
  const connectionGroupId = extra?.connectionGroupId;
  if (typeof userId !== "string" || !userId) throw new Error("Chưa xác thực tài khoản BodyMetrics.");
  if (connectionGroupId !== undefined && typeof connectionGroupId !== "string") throw new Error("Kết nối nhóm không hợp lệ.");
  return { userId, connectionGroupId: typeof connectionGroupId === "string" ? connectionGroupId : null };
}

/** Public URL of the BodyMetrics app, set by the /api/mcp routes; used to link back to records. */
function appOrigin(ctx: ToolContext): string | null {
  const origin = ctx.http?.authInfo?.extra?.appOrigin;
  return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin : null;
}

function pageUrl(origin: string | null, t: PhotoTarget): string | null {
  return origin ? origin + photoPagePath(t) : null;
}

/** Food photos saved in BodyMetrics for Claude that no meal uses yet (kept 3 days). */
const NEW_PHOTO_WINDOW_MS = 3 * 24 * 3600 * 1000;

async function actingProfile(ctx: ToolContext, profileUsername: string): Promise<{ userId: string; profileUsername: string }> {
  const auth = authContext(ctx);
  if (!profileUsername) throw new Error("Cần chọn profile_username từ list_profiles trước khi thao tác.");
  if (!auth.connectionGroupId) {
    const profile = await db.user.findFirst({
      where: { id: auth.userId, username: profileUsername, active: true },
      select: { id: true, username: true },
    });
    if (!profile) throw new Error("Username không khớp với hồ sơ được cấp quyền cho connector này.");
    return { userId: profile.id, profileUsername: profile.username };
  }

  const membership = await db.mcpConnectionGroupMember.findFirst({
    where: {
      groupId: auth.connectionGroupId,
      group: { ownerUserId: auth.userId },
      user: { username: profileUsername, active: true },
    },
    select: { userId: true, user: { select: { username: true } } },
  });
  if (!membership) throw new Error("Hồ sơ này chưa tham gia nhóm Claude hoặc đã rời nhóm.");
  return { userId: membership.userId, profileUsername: membership.user.username };
}

async function listProfiles(ctx: ToolContext) {
  const auth = authContext(ctx);
  if (!auth.connectionGroupId) {
    const user = await db.user.findFirst({ where: { id: auth.userId, active: true }, select: { id: true, username: true, name: true } });
    if (!user) throw new Error("Tài khoản BodyMetrics đã bị khóa.");
    return [{ profile_username: user.username, name: user.name.trim() || user.username }];
  }

  const members = await db.mcpConnectionGroupMember.findMany({
    where: { groupId: auth.connectionGroupId, group: { ownerUserId: auth.userId }, user: { active: true } },
    orderBy: { joinedAt: "asc" },
    select: { user: { select: { id: true, username: true, name: true } } },
  });
  return members.map(({ user }) => ({ profile_username: user.username, name: user.name.trim() || user.username }));
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function dayOverview(userId: string, date: string, origin: string | null) {
  const [s, meals, workouts] = await Promise.all([
    getDaySummary(userId, date),
    db.meal.findMany({
      where: { userId, date },
      orderBy: { eatenAt: "asc" },
      include: { items: true, _count: { select: { photos: true } } },
    }),
    db.workout.findMany({
      where: { userId, date },
      orderBy: { startedAt: "asc" },
      include: { entries: { include: { exercise: true } }, _count: { select: { photos: true } } },
    }),
  ]);
  return {
    date,
    intake_kcal: s.intakeKcal,
    target_kcal: s.targetKcal,
    remaining_kcal: s.targetKcal - s.intakeKcal,
    exercise_kcal: s.exerciseKcal,
    total_burn_kcal: s.totalBurn,
    protein_g: s.proteinG,
    protein_target_g: s.proteinTargetG,
    carb_g: s.carbG,
    fat_g: s.fatG,
    weight_kg: s.weightKg,
    meals: meals.map((m) => ({
      id: m.id,
      type: m.type,
      time: m.eatenAt.toTimeString().slice(0, 5),
      kcal: Math.round(m.items.reduce((a, i) => a + i.kcal, 0)),
      items: m.items.map((i) => `${i.name}${i.portionG ? ` ${i.portionG}g` : ""} ${Math.round(i.kcal)} kcal`),
      photos: m._count.photos,
      add_photo_url: pageUrl(origin, { kind: "meal", id: m.id }),
    })),
    workouts: workouts.map((w) => ({
      id: w.id,
      minutes: w.durationMin,
      kcal: Math.round(w.kcalOverride ?? w.entries.reduce((a, e) => a + e.kcal, 0)),
      exercises: w.entries.map((e) => e.exercise.name),
      photos: w._count.photos,
      add_photo_url: pageUrl(origin, { kind: "workout", id: w.id }),
    })),
  };
}

/** Shared library plus the user's own custom exercises. */
function exercisesFor(userId: string) {
  return db.exercise.findMany({ where: { OR: [{ userId: null }, { userId }] }, orderBy: { name: "asc" } });
}

/** Exact (case-insensitive) name, else the shortest name containing the query. */
async function findExercise(userId: string, name: string) {
  const all = await exercisesFor(userId);
  const q = name.trim().toLowerCase();
  return (
    all.find((e) => e.name.toLowerCase() === q) ??
    all.filter((e) => e.name.toLowerCase().includes(q)).sort((a, b) => a.name.length - b.name.length)[0] ??
    null
  );
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "list_profiles",
    {
      title: "Chọn hồ sơ BodyMetrics",
      description: "Liệt kê các hồ sơ được kết nối này cấp quyền truy cập. Gọi trước mỗi thao tác và hỏi người dùng nếu chưa rõ cần dùng hồ sơ nào.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args, ctx) => json({ profiles: await listProfiles(ctx) }),
  );

  server.registerTool(
    "get_day_summary",
    {
      title: "Tổng kết một ngày",
      description: "Calo đã ăn, mục tiêu, còn lại, calo tập, macro, cân nặng và danh sách bữa ăn/buổi tập của một ngày.",
      inputSchema: z.object({ profile_username: profileUsernameField, date: day }),
      annotations: { readOnlyHint: true },
    },
    async ({ profile_username, date }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      return json({ profile_username: profile.profileUsername, ...(await dayOverview(profile.userId, date ?? todayKey(), appOrigin(ctx))) });
    },
  );

  server.registerTool(
    "get_progress",
    {
      title: "Tiến độ nhiều ngày",
      description: "Tổng hợp theo ngày trong N ngày gần nhất (calo nạp, tiêu hao, cân bằng, protein, cân nặng) cùng hồ sơ và mục tiêu.",
      inputSchema: z.object({ profile_username: profileUsernameField, days: z.number().int().min(1).max(90).default(14) }),
      annotations: { readOnlyHint: true },
    },
    async ({ profile_username, days }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const to = todayKey();
      const [rows, p] = await Promise.all([getDaySummaries(userId, shiftDay(to, -(days - 1)), to), getProfile(userId)]);
      return json({
        profile_username: profile.profileUsername,
        profile: { goal_weight_kg: p.goalWeightKg, daily_deficit_kcal: p.dailyDeficit, protein_per_kg: p.proteinPerKg },
        days: rows.map((d) => ({
          date: d.date,
          meals: d.mealsLogged,
          intake_kcal: d.mealsLogged ? d.intakeKcal : null,
          target_kcal: d.targetKcal,
          burn_kcal: d.totalBurn,
          balance_kcal: d.mealsLogged ? d.balance : null,
          protein_g: d.mealsLogged ? d.proteinG : null,
          weight_kg: d.loggedWeightKg,
        })),
      });
    },
  );

  server.registerTool(
    "log_meal",
    {
      title: "Ghi bữa ăn",
      description: "Lưu một bữa ăn với các món đã ước lượng. Trả về id bữa ăn, add_photo_url (link để người dùng gắn ảnh vào bữa này) và tổng kết ngày sau khi lưu.",
      inputSchema: z.object({
        profile_username: profileUsernameField,
        meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).describe("breakfast=sáng, lunch=trưa, dinner=tối, snack=ăn vặt"),
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(200).describe("Tên món tiếng Việt"),
              portion_g: n(10000).nullable().optional(),
              kcal: n(20000),
              protein_g: n(2000).default(0),
              carb_g: n(2000).default(0),
              fat_g: n(2000).default(0),
              confidence: z.number().min(0).max(1).nullable().optional().describe("0..1 khi ước lượng từ ảnh"),
            }),
          )
          .min(1)
          .max(30),
        date: day,
        time: hhmm,
        note: z.string().max(1000).optional(),
        photo_id: z.string().optional().describe("photo_id từ list_new_photos khi bữa được ghi từ ảnh đã lưu trong BodyMetrics; ảnh sẽ tự gắn vào bữa"),
      }),
    },
    async ({ profile_username, meal_type, items, date, time, note, photo_id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const d = date ?? todayKey();
      const meal = await db.meal.create({
        data: {
          userId,
          date: d,
          type: meal_type,
          eatenAt: new Date(`${d}T${time ?? nowHHmm()}:00`),
          note: note?.trim() || "Ghi qua Claude",
          items: {
            create: items.map((i) => ({
              name: i.name.trim(),
              portionG: i.portion_g ?? null,
              kcal: Math.round(i.kcal),
              proteinG: i.protein_g,
              carbG: i.carb_g,
              fatG: i.fat_g,
              source: "ai",
              confidence: i.confidence ?? null,
            })),
          },
        },
      });
      // A photo saved in BodyMetrics and read with get_photo is attached here; one photo, one meal.
      const attached = photo_id
        ? await linkPendingPhoto(userId, photo_id, { kind: "meal", id: meal.id }, d)
        : false;
      const origin = appOrigin(ctx);
      return json({
        profile_username: profile.profileUsername,
        saved_meal_id: meal.id,
        photo_attached: attached,
        ...(photo_id && !attached ? { photo_note: "photo_id không còn hợp lệ (đã gắn vào bữa khác hoặc đã xóa)." } : {}),
        add_photo_url: pageUrl(origin, { kind: "meal", id: meal.id }),
        day: await dayOverview(userId, d, origin),
      });
    },
  );

  server.registerTool(
    "attach_photo",
    {
      title: "Gắn ảnh vào bữa ăn / buổi tập",
      description:
        "Gắn ảnh vào bữa ăn (meal_id) hoặc buổi tập (workout_id) đã lưu. Có photo_id (ảnh chờ từ list_new_photos) thì gắn ngay. Có image_url (link trực tiếp tới file ảnh) thì BodyMetrics tự tải và gắn ngay. Không có image_url thì trả upload_url có hiệu lực ${UPLOAD_LINK_MINUTES} phút: dùng công cụ chạy code tải file ảnh người dùng gửi trong chat lên đó.",
      inputSchema: z.object({
        profile_username: profileUsernameField,
        meal_id: z.string().optional(),
        workout_id: z.string().optional(),
        image_url: z.string().url().optional().describe("Link http(s) trực tiếp tới file ảnh, nếu người dùng đưa link"),
        photo_id: z.string().optional().describe("photo_id từ list_new_photos: ảnh người dùng đã lưu trong BodyMetrics"),
      }),
    },
    async ({ profile_username, meal_id, workout_id, image_url, photo_id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      if (Boolean(meal_id) === Boolean(workout_id)) return fail("Truyền đúng một trong meal_id hoặc workout_id.");
      const target: PhotoTarget = meal_id ? { kind: "meal", id: meal_id } : { kind: "workout", id: workout_id! };
      const entry = meal_id
        ? await db.meal.findFirst({ where: { id: meal_id, userId: profile.userId }, select: { date: true } })
        : await db.workout.findFirst({ where: { id: workout_id, userId: profile.userId }, select: { date: true } });
      if (!entry) return fail(meal_id ? "Không tìm thấy bữa ăn." : "Không tìm thấy buổi tập.");
      const origin = appOrigin(ctx);

      if (photo_id) {
        if (!(await linkPendingPhoto(profile.userId, photo_id, target, entry.date))) {
          return fail("photo_id không còn hợp lệ (đã gắn vào bản ghi khác, đã xóa hoặc không thuộc hồ sơ này). Gọi list_new_photos để lấy lại.");
        }
        return json({ profile_username: profile.profileUsername, photo_attached: true, photo_id, view_url: pageUrl(origin, target) });
      }
      const manualUrl = pageUrl(origin, target);

      if (image_url) {
        let file: File;
        try {
          file = await fetchImageFromUrl(image_url);
        } catch (err) {
          return fail(`${err instanceof Error ? err.message : "Không tải được ảnh."} Người dùng có thể tự gắn ảnh tại: ${manualUrl ?? ""}`);
        }
        const res = await attachPhotos(profile.userId, target, [file]);
        if (!res.ok) return fail(res.error);
        return json({ profile_username: profile.profileUsername, photo_attached: true, photo_id: res.photoIds[0], view_url: manualUrl });
      }

      if (!origin) return fail("Không xác định được địa chỉ BodyMetrics để tạo link tải ảnh.");
      const uploadUrl = `${origin}/api/photo-upload/${await signUploadToken(profile.userId, target)}`;
      return json({
        profile_username: profile.profileUsername,
        upload_url: uploadUrl,
        expires_in_minutes: UPLOAD_LINK_MINUTES,
        how_to_upload:
          "Trong công cụ chạy code: tìm file ảnh người dùng gửi (thường ở /mnt/user-data/uploads/, dùng ls), rồi chạy lệnh dưới với đường dẫn file đó. Ảnh trên 4 MB thì thu nhỏ trước (Pillow, cạnh dài 1600px, JPEG). Phản hồi thành công có \"ok\": true.",
        command: `curl -sS -X POST -F "photo=@<duong_dan_file_anh>" "${uploadUrl}"`,
        manual_url: manualUrl,
      });
    },
  );

  server.registerTool(
    "list_new_photos",
    {
      title: "Ảnh mới chờ phân tích",
      description:
        "Ảnh món ăn người dùng đã chụp/lưu trong BodyMetrics (nút \"Để Claude phân tích\") mà chưa gắn vào bữa nào, mới nhất trước. Dùng get_photo để xem ảnh.",
      inputSchema: z.object({ profile_username: profileUsernameField }),
      annotations: { readOnlyHint: true },
    },
    async ({ profile_username }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const photos = await db.photo.findMany({
        where: { userId: profile.userId, kind: "food", mealId: null, takenAt: { gte: new Date(Date.now() - NEW_PHOTO_WINDOW_MS) } },
        orderBy: { takenAt: "desc" },
        take: 10,
      });
      return json({
        profile_username: profile.profileUsername,
        photos: photos.map((p) => ({ photo_id: p.id, date: p.date, taken_at: p.takenAt.toTimeString().slice(0, 5) })),
      });
    },
  );

  server.registerTool(
    "get_photo",
    {
      title: "Xem ảnh món ăn",
      description: "Trả về ảnh món ăn (từ list_new_photos) để phân tích. Sau đó gọi log_meal với cùng photo_id.",
      inputSchema: z.object({ profile_username: profileUsernameField, photo_id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ profile_username, photo_id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const photo = await db.photo.findFirst({ where: { id: photo_id, userId: profile.userId, kind: "food" } });
      const data = photo ? await imageAsJpegBase64(photo.path, profile.userId) : null;
      if (!photo || !data) return fail("Không tìm thấy ảnh này trong hồ sơ.");
      return {
        content: [
          { type: "image" as const, data, mimeType: "image/jpeg" },
          {
            type: "text" as const,
            text: JSON.stringify({ photo_id: photo.id, date: photo.date, taken_at: photo.takenAt.toTimeString().slice(0, 5), already_logged: Boolean(photo.mealId) }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_exercises",
    {
      title: "Danh sách bài tập",
      description: "Tìm bài tập trong thư viện (tên, loại, MET) để dùng đúng tên khi gọi log_workout.",
      inputSchema: z.object({ profile_username: profileUsernameField, query: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ profile_username, query }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const q = query?.trim().toLowerCase();
      const all = await exercisesFor(profile.userId);
      return json({
        profile_username: profile.profileUsername,
        exercises: all
          .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup?.toLowerCase().includes(q))
          .map((e) => ({ name: e.name, category: e.category, met: e.met, muscle_group: e.muscleGroup })),
      });
    },
  );

  server.registerTool(
    "log_workout",
    {
      title: "Ghi buổi tập",
      description:
        "Lưu buổi tập. Calo mỗi bài được tính theo MET và cân nặng của người dùng; truyền kcal_override nếu có số từ đồng hồ. Bài tập chưa có trong thư viện sẽ được tạo nếu kèm met.",
      inputSchema: z.object({
        profile_username: profileUsernameField,
        entries: z
          .array(
            z.object({
              exercise_name: z.string().min(1).describe("Tên trong list_exercises, hoặc tên mới kèm met"),
              minutes: n(1440).describe("Số phút tập thực tế"),
              intensity: z.enum(["light", "moderate", "vigorous"]).default("moderate"),
              distance_km: n(1000).nullable().optional(),
              sets: z.array(z.object({ reps: n(1000).nullable().optional(), weight_kg: n(1000).nullable().optional() })).max(100).optional(),
              met: z.number().min(1).max(25).optional().describe("Chỉ khi bài tập chưa có trong thư viện"),
              category: z.enum(["strength", "cardio", "hiit", "other"]).optional(),
            }),
          )
          .min(1)
          .max(50),
        date: day,
        start_time: hhmm,
        duration_min: n(1440).optional().describe("Tổng thời gian; mặc định tổng phút các bài"),
        kcal_override: n(10000).optional().describe("Calo từ đồng hồ thông minh"),
        note: z.string().max(2000).optional(),
        photo_id: z.string().optional().describe("photo_id từ list_new_photos khi buổi tập được ghi từ ảnh đã lưu trong BodyMetrics"),
      }),
    },
    async ({ profile_username, entries, date, start_time, duration_min, kcal_override, note, photo_id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const d = date ?? todayKey();
      const weight = await getWeightOn(userId, d);
      const resolved = [];
      for (const e of entries) {
        let ex = await findExercise(userId, e.exercise_name);
        if (!ex) {
          if (e.met == null) {
            return fail(`Không tìm thấy bài tập "${e.exercise_name}". Gọi list_exercises để chọn tên đúng, hoặc truyền met để tạo bài mới.`);
          }
          ex = await db.exercise.create({ data: { userId, name: e.exercise_name.trim(), category: e.category ?? "other", met: e.met } });
        }
        resolved.push({ e, ex });
      }

      const workout = await db.workout.create({
        data: {
          userId,
          date: d,
          startedAt: new Date(`${d}T${start_time ?? nowHHmm()}:00`),
          durationMin: Math.round(duration_min ?? entries.reduce((a, e) => a + e.minutes, 0)),
          kcalOverride: kcal_override || null,
          note: note?.trim() || "Ghi qua Claude",
          entries: {
            create: resolved.map(({ e, ex }, i) => ({
              exerciseId: ex.id,
              order: i,
              durationMin: e.minutes,
              intensity: e.intensity,
              distanceKm: e.distance_km || null,
              kcal: exerciseKcal(ex.met, weight, e.minutes, e.intensity as Intensity),
              sets: {
                create: (e.sets ?? [])
                  .filter((s) => s.reps != null || s.weight_kg != null)
                  .map((s, j) => ({ setNo: j + 1, reps: s.reps == null ? null : Math.round(s.reps), weightKg: s.weight_kg ?? null })),
              },
            })),
          },
        },
        include: { entries: { include: { exercise: true } } },
      });
      return json({
        profile_username: profile.profileUsername,
        saved_workout_id: workout.id,
        exercises: workout.entries.map((e) => ({ name: e.exercise.name, kcal: e.kcal })),
        ...(photo_id ? { photo_attached: await linkPendingPhoto(userId, photo_id, { kind: "workout", id: workout.id }, d) } : {}),
        add_photo_url: pageUrl(appOrigin(ctx), { kind: "workout", id: workout.id }),
        day: await dayOverview(userId, d, appOrigin(ctx)),
      });
    },
  );

  server.registerTool(
    "log_body",
    {
      title: "Ghi chỉ số cơ thể",
      description: "Lưu cân nặng, vòng eo và/hoặc % mỡ.",
      inputSchema: z.object({
        profile_username: profileUsernameField,
        weight_kg: z.number().min(25).max(350).optional(),
        waist_cm: z.number().min(30).max(250).optional(),
        body_fat_pct: z.number().min(2).max(70).optional(),
        date: day,
        note: z.string().max(500).optional(),
      }),
    },
    async ({ profile_username, weight_kg, waist_cm, body_fat_pct, date, note }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      if (weight_kg == null && waist_cm == null && body_fat_pct == null) return fail("Cần ít nhất một chỉ số.");
      const log = await db.bodyLog.create({
        data: { userId, date: date ?? todayKey(), weightKg: weight_kg, waistCm: waist_cm, bodyFatPct: body_fat_pct, note: note?.trim() || null },
      });
      return json({ profile_username: profile.profileUsername, saved_body_log_id: log.id, date: log.date });
    },
  );

  server.registerTool(
    "delete_meal",
    {
      title: "Xóa bữa ăn",
      description:
        "Xóa vĩnh viễn một bữa ăn của người dùng theo id, kể cả ảnh đính kèm. Chỉ gọi khi người dùng yêu cầu xóa (ví dụ bữa vừa ghi nhầm); không tự ý xóa.",
      inputSchema: z.object({ profile_username: profileUsernameField, id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ profile_username, id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const meal = await db.meal.findFirst({ where: { id, userId }, include: { photos: true } });
      if (!meal) return fail("Không tìm thấy bữa ăn.");
      await db.$transaction([db.photo.deleteMany({ where: { mealId: id } }), db.meal.delete({ where: { id } })]);
      await Promise.all(meal.photos.map((p) => deleteImage(p.path, userId)));
      return json({ profile_username: profile.profileUsername, deleted_meal_id: id, day: await dayOverview(userId, meal.date, appOrigin(ctx)) });
    },
  );

  server.registerTool(
    "delete_workout",
    {
      title: "Xóa buổi tập",
      description: "Xóa vĩnh viễn một buổi tập của người dùng theo id. Chỉ gọi khi người dùng yêu cầu xóa; không tự ý xóa.",
      inputSchema: z.object({ profile_username: profileUsernameField, id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ profile_username, id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const w = await db.workout.findFirst({ where: { id, userId } });
      if (!w) return fail("Không tìm thấy buổi tập.");
      await deletePhotosOf(userId, { kind: "workout", id });
      await db.workout.delete({ where: { id } });
      return json({ profile_username: profile.profileUsername, deleted_workout_id: id, day: await dayOverview(userId, w.date, appOrigin(ctx)) });
    },
  );

  server.registerTool(
    "delete_body_log",
    {
      title: "Xóa lần ghi chỉ số",
      description:
        "Xóa vĩnh viễn một lần ghi cân nặng/số đo của người dùng theo id, kể cả ảnh đính kèm. Chỉ gọi khi người dùng yêu cầu xóa; không tự ý xóa.",
      inputSchema: z.object({ profile_username: profileUsernameField, id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ profile_username, id }, ctx) => {
      const profile = await actingProfile(ctx, profile_username);
      const userId = profile.userId;
      const log = await db.bodyLog.findFirst({ where: { id, userId }, include: { photos: true } });
      if (!log) return fail("Không tìm thấy lần ghi.");
      await db.$transaction([db.photo.deleteMany({ where: { bodyLogId: id } }), db.bodyLog.delete({ where: { id } })]);
      await Promise.all(log.photos.map((p) => deleteImage(p.path, userId)));
      return json({ profile_username: profile.profileUsername, deleted_body_log_id: id });
    },
  );
}
