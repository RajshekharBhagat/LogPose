import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import { fetchUserRepos } from "@/lib/github";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getServerSession(NextauthOptions);

  if (!session) {
    redirect("/login");
  }

  const repos = session.githubAccessToken
    ? await fetchUserRepos(session.githubAccessToken)
    : [];

  return (
    <DashboardClient
      user={{
        name: session.user?.name ?? null,
        email: session.user?.email ?? null,
        image: session.user?.image ?? null,
      }}
      repos={repos}
    />
  );
}
