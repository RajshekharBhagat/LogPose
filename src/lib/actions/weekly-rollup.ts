"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getJournal } from "@/lib/actions/get-journal";
import { synthesizeWeekly } from "@/lib/gemini";
import { clampMessageCount, type Persona, type StandupResult } from "@/types/standup";

export async function generateWeeklyRollup(persona: Persona, messageCount = 1): Promise<StandupResult> {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) throw new Error("Not authenticated.");

  const entries = await getJournal();
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceKey = since.toISOString().slice(0, 10);
  const week = entries
    .filter((entry) => entry.date >= sinceKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (week.length === 0) {
    throw new Error("No journal entries in the last 7 days.");
  }

  const notes = week
    .map(
      (entry) =>
        `### ${entry.date} (${entry.persona})\n${entry.markdown}`
    )
    .join("\n\n");

  const { markdown, whatsappMessage, messages, tokenCount } = await synthesizeWeekly(
    notes,
    persona,
    persona === "mis" ? clampMessageCount(messageCount) : 1
  );
  const repos = [...new Set(week.flatMap((entry) => entry.repos))];

  return {
    markdown,
    whatsappMessage,
    messages,
    persona,
    generatedAt: new Date().toISOString(),
    repos,
    activitySnapshot: {
      commitCount: week.reduce((sum, entry) => sum + entry.commitCount, 0),
      prCount: week.reduce((sum, entry) => sum + entry.prCount, 0),
    },
    tokenCount,
  };
}
