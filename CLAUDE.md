# BodyMetrics

Personal weight-loss tracker: meals (with AI photo calorie analysis), gym/cardio workouts, body measurements, progress photos, analytics. Single user, runs locally. **UI text is Vietnamese.**

## Stack
- Next.js 15 App Router + TypeScript + Tailwind v4 (theme tokens in `src/app/globals.css`)
- Prisma 6 + SQLite (`prisma/schema.prisma`), images on disk under `UPLOAD_DIR`
- Recharts for charts, lucide-react for icons, date-fns for dates
- Claude API (`@anthropic-ai/sdk`) for food photo analysis and weekly reports

## Commands
- First run in a fresh checkout/worktree: `cp .env.example .env && npm install && npm run setup` (db push + seed)
- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm run build`
- Schema change: edit `schema.prisma`, then `npm run db:push`. No migration files.

## Conventions
- **Days are local `YYYY-MM-DD` strings** (`date` columns). Use helpers in `src/lib/dates.ts`, never `toISOString()` for day keys.
- Energy math lives in `src/lib/calc.ts` (pure). Exercise kcal = `exerciseKcal(met, kg, minutes, intensity)` (net of resting MET). Store the computed value in `WorkoutEntry.kcal` at save time; `Workout.kcalOverride` replaces the sum when set.
- Daily totals/targets come from `getDaySummaries(from, to)` / `getDaySummary(date)` in `src/lib/summary.ts`. Reuse them; don't re-aggregate meals/workouts by hand.
- Weight for a day: `getWeightOn(day)` (latest log on/before that day).
- Images: `saveImage(file, "food" | "body")` from `src/lib/storage.ts` returns a relative path; create a `Photo` row; render with `uploadUrl(path)`. `imageAsJpegBase64(path)` gives a JPEG for the vision model.
- AI: `anthropic()` and `AI_MODEL` from `src/lib/ai/client.ts`. Check `hasAiKey()` and show a friendly message when no key. Load the `claude-api` skill before writing Claude API code.
- Mutations use server actions in a colocated `actions.ts` (`"use server"`), then `revalidatePath`. Parse numeric form fields with `parseNum` from `src/lib/format.ts`.
- Next 15: `params` and `searchParams` are Promises - `await` them.
- Pages that read the DB: `export const dynamic = "force-dynamic"`.
- UI primitives in `src/components/ui.tsx` (Card, CardTitle, Button, LinkButton, Input, Select, Textarea, Field, Stat, Progress, EmptyState, Badge, PageHeader). Use theme colors (`bg-surface`, `text-muted`, `border-border`, `text-accent`, `text-intake`, `text-burn`, `bg-protein`/`bg-carb`/`bg-fat`). Mobile first: layout must work at 375px.
- Navigation is in `src/components/nav.tsx` and already links every section.

## Section ownership (routes)
| Route | Area |
|---|---|
| `/` | Dashboard (today) |
| `/profile` | Profile & goals |
| `/body` | Body logs + progress photos |
| `/gallery` | All photos |
| `/meals`, `/meals/new`, `/meals/[id]` | Food log + AI photo analysis (`src/lib/ai/food.ts`) |
| `/workouts`, `/workouts/new`, `/workouts/[id]` | Workout log, exercise library |
| `/analytics` | Charts, adaptive TDEE, weekly AI report (`src/lib/ai/report.ts`) |

The dashboard links to `/meals/new` (supports `?date=YYYY-MM-DD`) and `/workouts/new` (same).
