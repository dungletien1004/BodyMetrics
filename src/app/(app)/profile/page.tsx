import { ClaudeConnections } from "@/components/connections/claude-connections";
import { Button, Card, CardTitle, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import { ageFrom, baselineTdee, bmi, bmr, proteinTarget, weeksToGoal } from "@/lib/calc";
import { todayKey } from "@/lib/dates";
import { kcal, num } from "@/lib/format";
import { getProfile, getWeightOn } from "@/lib/summary";
import { getViewer } from "@/lib/auth";
import { saveProfile } from "./actions";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

const ACTIVITY = [
  { value: 1.2, label: "Ít vận động (ngồi văn phòng)" },
  { value: 1.3, label: "Vận động nhẹ (đi lại nhiều)" },
  { value: 1.4, label: "Vận động vừa (đứng/đi phần lớn ngày)" },
  { value: 1.5, label: "Lao động chân tay" },
];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const viewer = await getViewer();
  const [p, weight] = await Promise.all([getProfile(viewer.userId), getWeightOn(viewer.userId, todayKey())]);
  const rate = -p.dailyDeficit * 7 / 7700;
  const weeks = p.goalWeightKg ? weeksToGoal(weight, p.goalWeightKg, rate) : null;

  return (
    <>
      <PageHeader title="Hồ sơ & mục tiêu" subtitle="Dùng để tính năng lượng nền (BMR), mục tiêu calo và protein." />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
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
              <Input name="birthYear" type="number" inputMode="numeric" defaultValue={p.birthYear} />
            </Field>
            <Field label="Chiều cao (cm)">
              <Input name="heightCm" type="number" step="0.1" inputMode="decimal" defaultValue={p.heightCm} />
            </Field>
            <Field label="Cân nặng ban đầu (kg)" hint="Dùng khi chưa có lần cân nào">
              <Input name="startWeightKg" type="number" step="0.1" inputMode="decimal" defaultValue={p.startWeightKg ?? ""} />
            </Field>
            <Field label="Cân nặng mục tiêu (kg)">
              <Input name="goalWeightKg" type="number" step="0.1" inputMode="decimal" defaultValue={p.goalWeightKg ?? ""} />
            </Field>
            <Field label="Mức vận động thường ngày" hint="Không tính buổi tập - buổi tập được cộng riêng" className="sm:col-span-2">
              <Select name="activityFactor" defaultValue={String(p.activityFactor)}>
                {ACTIVITY.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label} (×{a.value})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Thâm hụt mỗi ngày (kcal)" hint="300–500 kcal ≈ giảm 0,3–0,5 kg/tuần">
              <Input name="dailyDeficit" type="number" step="50" inputMode="numeric" defaultValue={p.dailyDeficit} />
            </Field>
            <Field label="Protein (g / kg cân nặng)" hint="Khuyến nghị 1,6–2,2 khi giảm cân">
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
          <Stat label="BMR (năng lượng nền)" value={kcal(bmr(p, weight))} unit="kcal" />
          <Stat label="Tiêu hao cơ bản / ngày" value={kcal(baselineTdee(p, weight))} unit="kcal" sub="Chưa gồm buổi tập" />
          <Stat label="Protein mục tiêu" value={proteinTarget(p, weight)} unit="g/ngày" />
          <Stat
            label="Tốc độ giảm dự kiến"
            value={num(-rate, 1)}
            unit="kg/tuần"
            sub={weeks ? `≈ ${weeks} tuần để đạt ${num(p.goalWeightKg)} kg` : undefined}
          />
        </Card>

        {!viewer.readOnly && (
          <Card className="lg:col-span-1">
            <CardTitle>Tài khoản · {viewer.user.username}</CardTitle>
            <PasswordForm />
          </Card>
        )}
      </div>
      <ClaudeConnections />
    </>
  );
}
