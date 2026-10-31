import { ClaudeConnections } from "@/components/connections/claude-connections";
import { Button, Card, CardTitle, Field, Input, LinkButton, PageHeader, Select, Stat } from "@/components/ui";
import { ACTIVITY_LEVELS, ageFrom, bmi, clampNote, energyPlan, proteinTarget, rateLabel } from "@/lib/calc";
import { todayKey } from "@/lib/dates";
import { kcal, num } from "@/lib/format";
import { getProfile, getWeightOn } from "@/lib/summary";
import { getViewer } from "@/lib/auth";
import { saveProfile } from "./actions";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const viewer = await getViewer();
  const [p, weight] = await Promise.all([getProfile(viewer.userId), getWeightOn(viewer.userId, todayKey())]);
  const plan = energyPlan(p, weight);

  return (
    <>
      <PageHeader title="Hồ sơ & mục tiêu" subtitle="Dùng để tính năng lượng nền (BMR), mục tiêu calo và đạm." />

      {!viewer.readOnly && (
        <div id="ket-noi-claude" className="mb-4 scroll-mt-20 [&>section]:mt-0">
          <ClaudeConnections />
        </div>
      )}

      {!p.onboardedAt ? (
        // Until onboarding, every Profile value is a default; showing them as "yours" would be fake.
        <section className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm">
            {viewer.readOnly
              ? "Người dùng này chưa hoàn tất thiết lập ban đầu nên chưa có hồ sơ."
              : "Bạn chưa thiết lập hồ sơ. Trả lời vài câu hỏi ngắn (khoảng 1 phút) để app tính mục tiêu calo và đạm cho riêng bạn."}
          </p>
          {!viewer.readOnly && (
            <LinkButton href="/onboarding" className="mt-3">
              Thiết lập ngay
            </LinkButton>
          )}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardTitle>Thông tin & mục tiêu</CardTitle>
            <form action={saveProfile} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên">
                <Input name="name" defaultValue={p.name} placeholder="Tên của bạn" />
              </Field>
              <Field label="Giới tính">
                <Select name="sex" defaultValue={p.sex}>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </Select>
              </Field>
              <Field label="Năm sinh" hint={`${ageFrom(p.birthYear)} tuổi`}>
                <Input name="birthYear" type="number" inputMode="numeric" defaultValue={p.birthYear} required />
              </Field>
              <Field label="Chiều cao (cm)">
                <Input name="heightCm" type="number" step="0.1" inputMode="decimal" defaultValue={p.heightCm} required />
              </Field>
              <Field label="Cân nặng mục tiêu (kg)" hint="Cân nặng hiện tại lấy từ lần cân gần nhất ở mục Cơ thể" className="sm:col-span-2">
                <Input name="goalWeightKg" type="number" step="0.1" inputMode="decimal" defaultValue={p.goalWeightKg ?? ""} />
              </Field>
              <Field label="Mức vận động thường ngày" hint="Không tính buổi tập - buổi tập được cộng riêng" className="sm:col-span-2">
                <Select name="activityFactor" defaultValue={String(p.activityFactor)}>
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}: {a.detail.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Thâm hụt mỗi ngày (kcal)" hint="275 / 550 / 825 kcal ≈ 0,25 / 0,5 / 0,75 kg/tuần">
                <Input name="dailyDeficit" type="number" step="25" inputMode="numeric" defaultValue={p.dailyDeficit} />
              </Field>
              <Field label="Đạm (g / kg cân nặng mục tiêu)" hint="Khuyến nghị 1,6–2,2 khi giảm cân">
                <Input name="proteinPerKg" type="number" step="0.1" inputMode="decimal" defaultValue={p.proteinPerKg} />
              </Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit">Lưu hồ sơ</Button>
                {saved && <span className="text-sm text-accent">Đã lưu.</span>}
              </div>
            </form>
          </Card>

          <Card className="space-y-4">
            <CardTitle>Chỉ số hiện tại</CardTitle>
            <Stat label="Cân nặng dùng để tính" value={num(weight)} unit="kg" sub={`BMI ${num(bmi(weight, p.heightCm))}`} />
            <Stat label="BMR (năng lượng nền)" value={kcal(plan.bmr)} unit="kcal" />
            <Stat label="Tiêu hao cơ bản / ngày" value={kcal(plan.tdee)} unit="kcal" sub="Chưa gồm buổi tập" />
            <Stat
              label="Mục tiêu ăn / ngày"
              value={kcal(plan.targetKcal)}
              unit="kcal"
              sub={`Thâm hụt thực tế ${kcal(plan.deficit)} kcal; ngày có tập được ăn thêm`}
            />
            <Stat
              label="Đạm mục tiêu"
              value={proteinTarget(p, weight)}
              unit="g/ngày"
              sub={p.goalWeightKg ? `${num(p.proteinPerKg)} g × ${num(p.goalWeightKg)} kg mục tiêu` : `${num(p.proteinPerKg)} g × cân nặng hiện tại`}
            />
            <Stat
              label="Tốc độ giảm thực tế"
              value={rateLabel(plan.kgPerWeek)}
              unit="kg/tuần"
              tone={plan.clamped ? "danger" : undefined}
              sub={
                plan.weeksToGoal
                  ? `≈ ${plan.weeksToGoal} tuần để đạt ${num(p.goalWeightKg)} kg`
                  : p.goalWeightKg && weight <= p.goalWeightKg
                    ? "Đã đạt cân nặng mục tiêu"
                    : undefined
              }
            />
            {plan.clamped && (
              <p className="text-xs text-danger">
                Bạn đặt {rateLabel(plan.plannedKgPerWeek)} kg/tuần. {clampNote(plan.bmr)}
              </p>
            )}
          </Card>
        </div>
      )}

      {!viewer.readOnly && (
        <Card className="mt-4">
          <CardTitle>Tài khoản · {viewer.user.username}</CardTitle>
          <PasswordForm />
        </Card>
      )}
    </>
  );
}
