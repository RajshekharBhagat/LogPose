"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDb } from "@/lib/db";
import type { Persona } from "@/types/standup";

export interface JournalEntry {
  date: string;       // "YYYY-MM-DD"
  repos: string[];
  markdown: string;
  persona: Persona;
  generatedAt: string;
  commitCount: number;
  prCount: number;
}

export async function getJournal(): Promise<JournalEntry[]> {
  const session = await getServerSession(NextauthOptions);

  if (!session?.githubLogin) {
    throw new Error("Not authenticated.");
  }

  const db = await getDb();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const since = ninetyDaysAgo.toISOString().slice(0, 10);

  const docs = await db
    .collection("journal")
    .find(
      { userId: session.githubLogin, date: { $gte: since } },
      { projection: { _id: 0, userId: 0 } }
    )
    .sort({ date: -1 })
    .toArray();

  return docs as unknown as JournalEntry[];
}
