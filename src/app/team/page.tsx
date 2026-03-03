import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getMyTeam } from "@/lib/actions/team-actions";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) redirect("/login");

  const team = await getMyTeam();

  return (
    <TeamClient
      userId={session.githubLogin}
      team={team}
    />
  );
}
