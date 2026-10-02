import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import { fetchUserRepos } from "@/lib/github";
import { getLinkedAccounts } from "@/lib/actions/account-actions";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getServerSession(NextauthOptions);

  if (!session) {
    redirect("/login");
  }

  const [repoResult, linkedAccounts] = await Promise.all([
    session.githubAccessToken
      ? fetchUserRepos(session.githubAccessToken).catch((err: unknown) => ({
          repos: [],
          error: err instanceof Error ? err.message : "Could not load repositories.",
        }))
      : { repos: [], error: "Not authenticated with GitHub." },
    getLinkedAccounts(),
  ]);

  return (
    <DashboardClient
      user={{
        name: session.user?.name ?? null,
        email: session.user?.email ?? null,
        image: session.user?.image ?? null,
        login: session.githubLogin ?? null,
      }}
      repos={repoResult.repos}
      repoError={repoResult.error}
      linkedAccounts={linkedAccounts}
    />
  );
}
