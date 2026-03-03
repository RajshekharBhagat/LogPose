import { redirect } from "next/navigation";

// Onboarding is now handled inline on the team page
export default function OnboardPage() {
  redirect("/team");
}
