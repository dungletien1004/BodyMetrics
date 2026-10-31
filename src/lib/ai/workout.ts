import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Intensity } from "../calc";
import { imageAsJpegBase64 } from "../storage";
import { INTENSITIES } from "../workouts";
import { AI_MODEL, anthropic, hasAiKey } from "./client";

const SetSchema = z.object({
  reps: z.number().nullable().describe("Số lần lặp của set; null nếu ảnh không cho biết"),
  weight_kg: z.number().nullable().describe("Khối lượng tạ theo kg; null với bài bodyweight hoặc không rõ"),
});

const EntrySchema = z.object({
  exercise_name: z.string().describe("Tên bài phải trùng chính xác một tên trong danh sách thư viện"),
  minutes: z.number().describe("Số phút cho riêng bài tập này; 0 nếu không xác định được"),
  intensity: z.enum(INTENSITIES).describe("Cường độ light, moderate hoặc vigorous"),
  distance_km: z.number().nullable().describe("Quãng đường km nếu là cardio và nhìn thấy; nếu không thì null"),
  sets: z.array(SetSchema).describe("Các set theo thứ tự trong ảnh; mảng rỗng cho cardio"),
});

const AnalysisSchema = z.object({
  entries: z.array(EntrySchema).describe("Các bài tập của người dùng được thấy trong ảnh"),
  notes: z.string().describe("Ghi chú ngắn bằng tiếng Việt về giả định hoặc dữ liệu chưa rõ"),
});

export interface WorkoutExerciseCandidate {
  id: string;
  name: string;
  category: string;
}

export interface AnalyzedWorkoutEntry {
  exerciseId: string;
  exerciseName: string;
  minutes: number;
  intensity: Intensity;
  distanceKm: number | null;
  sets: { reps: number | null; weightKg: number | null }[];
}

export type AnalyzeWorkoutResult =
  | { ok: true; entries: AnalyzedWorkoutEntry[]; notes: string; unmatchedExerciseNames: string[] }
  | { ok: false; error: string };

const SYSTEM = `Bạn là trợ lý ghi nhật ký tập luyện trong ứng dụng giảm cân tiếng Việt. Đọc ảnh màn hình máy tập, đồng hồ, lịch sử máy hoặc ghi chú số set và chỉ trích xuất buổi tập mà người dùng đang ghi.

Thư viện bài tập hợp lệ (mỗi dòng: tên chính xác | nhóm):
{{EXERCISES}}

Quy tắc:
- Chỉ dùng exercise_name trùng chính xác tên trong danh sách. Không tự tạo tên bài. Nếu không khớp, bỏ qua bài đó và nói trong notes.
- Với mỗi bài, ghi minutes theo thời lượng riêng của bài nếu đọc được; nếu ảnh chỉ có tổng thời lượng cho cả buổi, chia hợp lý giữa các bài và nêu đây là ước tính trong notes. Nếu không có thời gian, dùng 0.
- Liệt kê set theo thứ tự. reps là số lần lặp, weight_kg là kg; null khi không biết. Không bịa số set hoặc tạ. Bài bodyweight có weight_kg = null.
- Cardio: sets là mảng rỗng; điền distance_km chỉ khi ảnh hiển thị quãng đường.
- Chọn cường độ light, moderate hoặc vigorous theo nội dung ảnh; mặc định moderate nếu không rõ.
- Không đưa calo hoặc dữ liệu của người khác. Toàn bộ notes bằng tiếng Việt.
- Nếu ảnh không chứa buổi tập hoặc không đọc được bài tập, trả entries rỗng và giải thích trong notes.`;

function normalizeName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function clamp(n: number | null, min: number, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Khóa API Anthropic không hợp lệ. Kiểm tra ANTHROPIC_API_KEY trong .env.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Khóa API không có quyền dùng mô hình này.";
  if (err instanceof Anthropic.RateLimitError) return "AI đang bị giới hạn tần suất. Thử lại sau ít phút.";
  if (err instanceof Anthropic.BadRequestError) return "AI không xử lý được ảnh này. Thử ảnh khác hoặc nhập tay.";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "AI phản hồi quá lâu. Thử lại sau.";
  if (err instanceof Anthropic.APIConnectionError) return "Không kết nối được tới AI. Kiểm tra mạng rồi thử lại.";
  if (err instanceof Anthropic.InternalServerError) return "Dịch vụ AI đang gặp sự cố. Thử lại sau.";
  if (err instanceof Anthropic.APIError) return `Lỗi từ dịch vụ AI (${err.status ?? "?"}). Thử lại sau.`;
  return "Không phân tích được ảnh. Thử lại hoặc nhập tay.";
}

/** Extract workout details from a stored image, keeping only exercises visible to this user. */
export async function analyzeWorkoutPhoto(
  photoPath: string,
  userId: string,
  candidates: WorkoutExerciseCandidate[],
): Promise<AnalyzeWorkoutResult> {
  if (!hasAiKey()) return { ok: false, error: "Chưa cấu hình ANTHROPIC_API_KEY nên chưa thể phân tích ảnh tập luyện." };
  if (!candidates.length) return { ok: false, error: "Thư viện chưa có bài tập để khớp. Hãy thêm bài tập vào thư viện trước." };

  let image: string;
  try {
    image = await imageAsJpegBase64(photoPath, userId);
  } catch {
    return { ok: false, error: "Không đọc được ảnh đã tải lên." };
  }

  const exerciseList = candidates.map((exercise) => `${exercise.name} | ${exercise.category}`).join("\n");
  const system = SYSTEM.replace("{{EXERCISES}}", exerciseList);

  try {
    const response = await anthropic().beta.messages.parse({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: "Đọc thông tin bài tập trong ảnh này để điền vào biểu mẫu buổi tập." },
          ],
        },
      ],
      system,
      output_config: { effort: "medium", format: zodOutputFormat(AnalysisSchema) },
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "AI từ chối phân tích ảnh này. Hãy nhập bài tập bằng tay." };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "Kết quả AI bị cắt ngang. Hãy thử ảnh gọn hơn." };
    const parsed = response.parsed_output;
    if (!parsed) return { ok: false, error: "AI trả về kết quả không đúng định dạng. Thử lại." };

    const byName = new Map(candidates.map((exercise) => [normalizeName(exercise.name), exercise]));
    const unmatchedExerciseNames: string[] = [];
    const entries = parsed.entries.flatMap((entry): AnalyzedWorkoutEntry[] => {
      const exercise = byName.get(normalizeName(entry.exercise_name));
      if (!exercise) {
        const name = entry.exercise_name.trim();
        if (name && !unmatchedExerciseNames.includes(name)) unmatchedExerciseNames.push(name);
        return [];
      }
      const minutes = clamp(entry.minutes, 0, 1440) ?? 0;
      const sets = entry.sets.slice(0, 100).map((set) => ({
        reps: clamp(set.reps, 0, 1000),
        weightKg: clamp(set.weight_kg, 0, 1000),
      }));
      return [{
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        minutes,
        intensity: entry.intensity,
        distanceKm: clamp(entry.distance_km, 0, 1000),
        sets,
      }];
    });

    if (!entries.length) return { ok: false, error: parsed.notes.trim() || "Không khớp bài nào trong thư viện. Hãy chọn bài tập thủ công." };
    return { ok: true, entries, notes: parsed.notes.trim(), unmatchedExerciseNames };
  } catch (err) {
    console.error("analyzeWorkoutPhoto failed", err);
    return { ok: false, error: errorMessage(err) };
  }
}
