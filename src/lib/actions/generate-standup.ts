"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchGitHubActivity } from "@/lib/github";
import { synthesizeWithGemini } from "@/lib/gemini";
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
  sanitize: boolean
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

  const activities = await Promise.all(
    repos.map((r) =>
      fetchGitHubActivity(
        session.githubAccessToken!,
        session.githubLogin!,
        r.fullName,
        r.branch
      )
    )
  );

  const merged: GitHubActivity = {
    username: activities[0].username,
    fetchedAt: new Date().toISOString(),
    commits: activities.flatMap((a) => a.commits),
    pullRequests: activities.flatMap((a) => a.pullRequests),
    hasActivity: activities.some((a) => a.hasActivity),
  };

  const finalActivity = sanitizeActivity(merged, sanitize);
  const { markdown, whatsappMessage } = await synthesizeWithGemini(finalActivity, persona);

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
  };
}
