"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDb } from "@/lib/db";
import type { TeamProfile, LeaderboardEntry } from "@/types/team";

function randomInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

async function requireSession() {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) throw new Error("Not authenticated.");
  return session;
}

export async function createTeam(
  name: string
): Promise<{ invite_code: string }> {
  const session = await requireSession();
  const db = await getDb();

  const invite_code = randomInviteCode();
  const now = new Date();

  await db.collection("teams").insertOne({
    name: name.trim(),
    invite_code,
    owner_id: session.githubLogin,
    created_at: now,
  });

  const team = await db.collection("teams").findOne({ invite_code });

  await db.collection("profiles").updateOne(
    { userId: session.githubLogin },
    {
      $set: {
        userId: session.githubLogin,
        team_id: (team!._id).toString(),
        name: session.user?.name ?? session.githubLogin,
        avatar_url: session.user?.image ?? "",
        joined_at: now,
      },
    },
    { upsert: true }
  );

  return { invite_code };
}

export async function joinTeam(invite_code: string): Promise<void> {
  const session = await requireSession();
  const db = await getDb();

  const team = await db
    .collection("teams")
    .findOne({ invite_code: invite_code.trim().toUpperCase() });

  if (!team) throw new Error("Invalid invite code. Please check and try again.");

  await db.collection("profiles").updateOne(
    { userId: session.githubLogin },
    {
      $set: {
        userId: session.githubLogin,
        team_id: team._id.toString(),
        name: session.user?.name ?? session.githubLogin,
        avatar_url: session.user?.image ?? "",
        joined_at: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function getMyTeam(): Promise<{
  team_id: string;
  name: string;
  invite_code: string;
} | null> {
  const session = await requireSession();
  const db = await getDb();

  const profile = await db
    .collection("profiles")
    .findOne({ userId: session.githubLogin });

  if (!profile?.team_id) return null;

  const { ObjectId } = await import("mongodb");
  let teamOid;
  try {
    teamOid = new ObjectId(profile.team_id as string);
  } catch {
    return null;
  }

  const team = await db.collection("teams").findOne({ _id: teamOid });
  if (!team) return null;

  return {
    team_id: profile.team_id as string,
    name: team.name as string,
    invite_code: team.invite_code as string,
  };
}

export async function getTeamMembers(): Promise<TeamProfile[]> {
  const session = await requireSession();
  const db = await getDb();

  const profile = await db
    .collection("profiles")
    .findOne({ userId: session.githubLogin });

  if (!profile?.team_id) return [];

  const members = await db
    .collection("profiles")
    .find({ team_id: profile.team_id }, { projection: { _id: 0 } })
    .toArray();

  return members as unknown as TeamProfile[];
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const session = await requireSession();
  const db = await getDb();

  const profile = await db
    .collection("profiles")
    .findOne({ userId: session.githubLogin });

  if (!profile?.team_id) return [];

  const teamId = profile.team_id as string;

  // Aggregate quality scores per user for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().slice(0, 10);

  const rows = await db
    .collection("journal")
    .aggregate([
      {
        $match: {
          team_id: teamId,
          date: { $gte: since },
          "quality_score.total_score": { $exists: true },
        },
      },
      {
        $group: {
          _id: "$userId",
          avg_score: { $avg: "$quality_score.total_score" },
          total_logs: { $sum: 1 },
          dates: { $addToSet: "$date" },
        },
      },
      { $sort: { avg_score: -1 } },
    ])
    .toArray();

  // Fetch profile info for each user
  const userIds = rows.map((r) => r._id as string);
  const profiles = await db
    .collection("profiles")
    .find({ userId: { $in: userIds } }, { projection: { _id: 0 } })
    .toArray();

  const profileMap = new Map(profiles.map((p) => [p.userId as string, p]));

  return rows.map((row) => {
    const p = profileMap.get(row._id as string);
    // Calculate streak: consecutive days ending today
    const sortedDates = (row.dates as string[]).sort().reverse();
    let streak = 0;
    const check = new Date();
    for (const d of sortedDates) {
      const expected = check.toISOString().slice(0, 10);
      if (d === expected) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      userId: row._id as string,
      name: (p?.name as string) ?? (row._id as string),
      avatar_url: (p?.avatar_url as string) ?? "",
      avg_score: Math.round((row.avg_score as number) * 10) / 10,
      total_logs: row.total_logs as number,
      streak,
    };
  });
}
