# BodyMetrics

Weight-loss tracker: meals (with AI photo calorie analysis), gym/cardio workouts, body measurements, progress photos, analytics. **Multi-user**: each account sees only its own data; admins create accounts and can view any user's data read-only. Deployed on Vercel + Neon. **UI text is Vietnamese.**

## Stack
- Next.js 15 App Router + TypeScript + Tailwind v4 (theme tokens in `src/app/globals.css`)
- Prisma 6 + Postgres (`prisma/schema.prisma`; Neon in production, `npm run db:up` locally), photos stored in the database
- Recharts for charts, lucide-react for icons, date-fns for dates
- Claude API (`@anthropic-ai/sdk`) for food photo analysis and weekly reports

## Commands
- First run in a fresh checkout/worktree: `cp .env.example .env && npm install && npm run setup` (db push + seed)
- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm run build`
- Schema change: edit `schema.prisma`, then `npm run db:push` (runs `prisma/pre-push.ts` first for data-preserving steps db push can't do). No migration files.
- Demo data for checking charts: `npx tsx prisma/demo-data.ts --yes`; remove with `--clean` (rows tagged `[demo]`).
- Code under `.claude/worktrees/` belongs to other sessions; it is excluded from lint, tsc and git.

## Conventions
- **Every query on personal data is scoped by `userId`.** Pages: `const { userId } = await getViewer()` (from `src/lib/auth`), then pass `userId` to lib functions (`getProfile(userId)`, `getDaySummaries(userId, from, to)`, `getWeightOn(userId, day)`, `getWeightSeries(userId, days)` …) and add `userId` to every `where`/`create`. Use `findFirst({ where: { id, userId } })`, never `findUnique({ where: { id } })`, for user-owned rows. Server actions that write call `requireWriter()` (returns the userId, throws in read-only view-as mode). Exercises: `userId = null` is the shared library, visible via `visibleExercises(userId)`.
- **Days are local `YYYY-MM-DD` strings** (`date` columns). Use helpers in `src/lib/dates.ts`, never `toISOString()` for day keys.
- Energy math lives in `src/lib/calc.ts` (pure). Exercise kcal = `exerciseKcal(met, kg, minutes, intensity)` (net of resting MET). Store the computed value in `WorkoutEntry.kcal` at save time; `Workout.kcalOverride` replaces the sum when set.
- Daily totals/targets come from `getDaySummaries(from, to)` / `getDaySummary(date)` in `src/lib/summary.ts`. Reuse them; don't re-aggregate meals/workouts by hand.
- Weight for a day: `getWeightOn(day)` (latest log on/before that day).
- Images: `saveImage(file)` from `src/lib/storage.ts` stores the photo as WebP in the `ImageBlob` table and returns its id; create a `Photo` row; render with `uploadUrl(path)`. `imageAsJpegBase64(path)` gives a JPEG for the vision model.
- AI: `anthropic()` and `AI_MODEL` from `src/lib/ai/client.ts`. Check `hasAiKey()` and show a friendly message when no key. Load the `claude-api` skill before writing Claude API code.
- Mutations use server actions in a colocated `actions.ts` (`"use server"`), then `revalidatePath`. Parse numeric form fields with `parseNum` from `src/lib/format.ts`.
- Next 15: `params` and `searchParams` are Promises - `await` them.
- Pages that read the DB: `export const dynamic = "force-dynamic"`.
- UI primitives in `src/components/ui.tsx` (Card, CardTitle, Button, LinkButton, Input, Select, Textarea, Field, Stat, Progress, EmptyState, Badge, PageHeader). Use theme colors (`bg-surface`, `text-muted`, `border-border`, `text-accent`, `text-intake`, `text-burn`, `bg-protein`/`bg-carb`/`bg-fat`). Mobile first: layout must work at 375px.
- Navigation is in `src/components/nav.tsx` and already links every section.

## Auth
- Single account in the `User` table. On first login, `AUTH_USERNAME` / `AUTH_PASSWORD` create it if the table is empty; `npm run user:set -- <u> <p>` creates or resets it. Password change lives on `/profile`.
- `User.role` is "admin" | "user"; `User.active=false` blocks sign-in. `requireAdmin()` guards admin pages. Admin "view as": `startViewAs(userId)` sets the `bm_view_as` cookie, `getViewer()` then returns that user with `readOnly: true`; the (app) layout shows a banner and disables form controls; `exitViewAs` in `src/app/(app)/view-as-actions.ts` leaves it.
- `src/middleware.ts` checks the signed `bm_session` cookie (HS256 with `AUTH_SECRET`) on every request except `/login`, `/api/mcp` and PWA assets: pages redirect to `/login`, API calls and server actions get 401.
- App pages live in the `src/app/(app)/` route group; its layout calls `requireUser()`, which also rejects sessions issued before a password change (`User.sessionVer`).

## Section ownership (routes)
All app routes below are under `src/app/(app)/`.

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
