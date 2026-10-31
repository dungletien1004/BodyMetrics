import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getWeightSeries } from "@/lib/body";
import { getProfile } from "@/lib/summary";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

// First-run setup. Nothing here is prefilled from Profile defaults (1995, 170 cm...): only values
// the user actually gave (name, a weigh-in) are carried over.
export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (viewer.readOnly) redirect("/");
  const [profile, series] = await Promise.all([getProfile(viewer.userId), getWeightSeries(viewer.userId, 7)]);
  if (profile.onboardedAt) redirect("/");

  return (
    <OnboardingWizard
      initialName={profile.name || viewer.user.name}
      initialWeight={series.latestEver}
      thisYear={new Date().getFullYear()}
    />
  );
}
