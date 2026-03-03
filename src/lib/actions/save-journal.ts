"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDb } from "@/lib/db";
import type { StandupResult } from "@/types/standup";

export async function saveJournal(result: StandupResult): Promise<void> {
  const session = await getServerSession(NextauthOptions);

  if (!session?.githubLogin) {
    throw new Error("Not authenticated.");
  }

  const db = await getDb();
  const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Look up team membership (optional — journal saves work without a team too)
  const profile = await db
    .collection("profiles")
    .findOne({ userId: session.githubLogin });

  await db.collection("journal").insertOne({
    userId: session.githubLogin,
    date,
    repos: result.repos,
    markdown: result.markdown,
    persona: result.persona,
    generatedAt: result.generatedAt,
    commitCount: result.activitySnapshot.commitCount,
    prCount: result.activitySnapshot.prCount,
    ...(result.qualityScore ? { quality_score: result.qualityScore } : {}),
    ...(profile?.team_id ? { team_id: profile.team_id } : {}),
  });
}
