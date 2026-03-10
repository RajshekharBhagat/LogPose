"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchGitHubActivity } from "@/lib/github";
import { synthesizeWithGemini, scoreWithGemini } from "@/lib/gemini";
import { sanitizeActivity } from "@/lib/sanitize";
import type { Persona, StandupResult } from "@/types/standup";
import type { GitHubActivity } from "@/types/github";

export interface RepoSelection {
  fullName: string;
  branch: string;
}

export async function generateStandup(
  persona: Persona,
  repos: RepoSelection[],
  sanitize = true,
  hoursBack = 24,
  authorOnly = true,
  selectedShas?: string[],
  overrideToken?: string,
  overrideLogin?: string
): Promise<StandupResult> {
  const session = await getServerSession(NextauthOptions);

  if (!session?.githubAccessToken) {
    throw new Error("Not authenticated. Please sign in again.");
  }

  if (!session.githubLogin) {
    throw new Error(
      "GitHub username not found. Please sign out and sign in again."
    );
  }

  if (repos.length === 0) {
    throw new Error("No repositories selected.");
  }

  const token = overrideToken ?? session.githubAccessToken;
  const login = overrideLogin ?? session.githubLogin;

  const activities = await Promise.all(
    repos.map((r) =>
      fetchGitHubActivity(token, login, r.fullName, r.branch, hoursBack, authorOnly)
    )
  );

  const merged: GitHubActivity = {
    username: login,
    fetchedAt: new Date().toISOString(),
    commits: activities.flatMap((a) => a.commits),
    pullRequests: activities.flatMap((a) => a.pullRequests),
    hasActivity: activities.some((a) => a.hasActivity),
  };

  // Filter to selected commits only (if a selection was provided)
  if (selectedShas && selectedShas.length > 0) {
    merged.commits = merged.commits.filter((c) => selectedShas.includes(c.sha));
  }

  const finalActivity = sanitizeActivity(merged, sanitize);

  const [{ markdown, whatsappMessage, tokenCount }, qualityScore] =
    await Promise.all([
      synthesizeWithGemini(finalActivity, persona),
      scoreWithGemini(finalActivity),
    ]);

  return {
    markdown,
    whatsappMessage,
    persona,
    generatedAt: new Date().toISOString(),
    repos: repos.map((r) => r.fullName),
    activitySnapshot: {
      commitCount: finalActivity.commits.length,
      prCount: finalActivity.pullRequests.length,
    },
    tokenCount,
    qualityScore: qualityScore ?? undefined,
  };
}
