import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { imageAsJpegBase64 } from "../storage";
import { AI_MODEL, anthropic, hasAiKey } from "./client";

// Structured-output schema. Range limits are enforced after parsing (clampItem),
// since JSON-schema numeric bounds are not part of the structured-output subset.
const FoodItemSchema = z.object({
  name: z.string().describe("Short Vietnamese name of the food or drink, e.g. 'Cơm tấm sườn nướng'"),
  portion_g: z.number().describe("Estimated edible portion in grams (ml for drinks)"),
  kcal: z.number(),
  protein_g: z.number(),
  carb_g: z.number(),
  fat_g: z.number(),
  confidence: z.number().describe("0..1, how sure you are about the identification and the portion"),
  note: z.string().nullable().describe("Brief assumption worth showing the user, e.g. 'tính cả mỡ hành'"),
});

const FoodAnalysisSchema = z.object({
  items: z.array(FoodItemSchema),
  notes: z.string().describe("One or two Vietnamese sentences on overall assumptions (oil, sauce, portion size)"),
  no_food_reason: z.string().nullable().describe("If no food or drink is visible, why (Vietnamese); otherwise null"),
});

export interface FoodItemEstimate {
  name: string;
  portionG: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  confidence: number;
  note: string | null;
}

export interface FoodAnalysis {
  items: FoodItemEstimate[];
  notes: string;
  noFoodReason: string | null;
}

export type AnalyzeFoodResult =
  | { ok: true; analysis: FoodAnalysis; raw: string }
  | { ok: false; error: string };

const SYSTEM = `You are a nutrition assistant inside a personal weight-loss tracker used by a Vietnamese user. You estimate the energy and macronutrients of a meal from one photo.

For every distinct food or drink item visible:
- Identify it. Expect Vietnamese home cooking and street food (phở, bún bò, bún chả, cơm tấm, cơm gà, bánh mì, xôi, bánh cuốn, gỏi cuốn, chè, cà phê sữa đá, trà sữa...) as well as international food. Name items in Vietnamese the way a Vietnamese person would.
- Estimate the edible portion in grams using visual cues: plate and bowl size (a typical Vietnamese rice bowl holds about 150-200 g cooked rice; a phở bowl is 500-700 g including broth), utensils, hands, packaging.
- Estimate kcal, protein, carbohydrate and fat for that portion. Account for hidden energy: cooking oil, fried shallots and mỡ hành, fatty broth, sweetened condensed milk, sugar in drinks and sauces, dipping sauces (nước mắm pha, tương, mayonnaise), coconut milk. Include them in the item they belong to, or as a separate item when they are served separately.
- Keep kcal consistent with the macros (about 4 kcal/g protein and carbs, 9 kcal/g fat, 7 kcal/g alcohol).
- Give a confidence from 0 to 1. Use lower values when the dish is ambiguous, partly hidden, or the portion is hard to judge.

Group components that are eaten as one dish into one item (e.g. "Cơm tấm sườn bì chả" rather than rice, pork and egg separately) unless they are clearly separate servings. Do not count items that are obviously not being eaten by the user (e.g. other people's plates in the background) unless the hint says otherwise.

If the user gives a hint, treat it as reliable information about what the food is or how much was eaten.

If no food or drink is visible, return an empty items list and explain why in no_food_reason. Write all names, notes and reasons in Vietnamese.`;

function clampItem(i: z.infer<typeof FoodItemSchema>): FoodItemEstimate {
  const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0);
  return {
    name: i.name.trim() || "Món không rõ",
    portionG: nonNeg(i.portion_g),
    kcal: Math.round(nonNeg(i.kcal)),
    proteinG: nonNeg(i.protein_g),
    carbG: nonNeg(i.carb_g),
    fatG: nonNeg(i.fat_g),
    confidence: Number.isFinite(i.confidence) ? Math.min(1, Math.max(0, i.confidence)) : 0.5,
    note: i.note?.trim() || null,
  };
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

/** Estimate the foods, portions and macros in a stored food photo. Never throws. */
export async function analyzeFoodPhoto(photoPath: string, hint?: string): Promise<AnalyzeFoodResult> {
  if (!hasAiKey()) return { ok: false, error: "Chưa cấu hình ANTHROPIC_API_KEY nên không thể phân tích ảnh." };

  let image: string;
  try {
    image = await imageAsJpegBase64(photoPath);
  } catch {
    return { ok: false, error: "Không đọc được ảnh đã lưu." };
  }

  const cleanHint = hint?.trim().slice(0, 300);
  const text = cleanHint
    ? `Analyze this meal. The user's hint: "${cleanHint}"`
    : "Analyze this meal.";

  try {
    // Server-side fallback re-runs a safety-classifier refusal on another model in the same call.
    const response = await anthropic().beta.messages.parse({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: AI_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(FoodAnalysisSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "AI từ chối phân tích ảnh này. Hãy nhập món ăn bằng tay." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, error: "Kết quả của AI bị cắt ngang. Thử lại." };
    }
    const parsed = response.parsed_output;
    if (!parsed) return { ok: false, error: "AI trả về kết quả không đúng định dạng. Thử lại." };

    const analysis: FoodAnalysis = {
      items: parsed.items.map(clampItem),
      notes: parsed.notes.trim(),
      noFoodReason: parsed.no_food_reason?.trim() || null,
    };
    const raw = JSON.stringify({ model: response.model, hint: cleanHint ?? null, output: parsed, usage: response.usage });
    return { ok: true, analysis, raw };
  } catch (err) {
    console.error("analyzeFoodPhoto failed", err);
    return { ok: false, error: errorMessage(err) };
  }
}
