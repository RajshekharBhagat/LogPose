"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchCommitDiff, fetchGitHubActivity } from "@/lib/github";
import { synthesizeWithGemini, scoreWithGemini } from "@/lib/gemini";
import { sanitizeActivity } from "@/lib/sanitize";
import { clampMessageCount, type Persona, type StandupResult } from "@/types/standup";
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
  overrideLogin?: string,
  preloaded?: GitHubActivity,
  messageCount = 1
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

  if (!preloaded && repos.length === 0) {
    throw new Error("No repositories selected.");
  }

  const token = overrideToken ?? session.githubAccessToken;
  const login = overrideLogin ?? session.githubLogin;

  let merged: GitHubActivity;

  if (preloaded) {
    merged = {
      ...preloaded,
      commits: [...preloaded.commits],
      pullRequests: [...preloaded.pullRequests],
    };
  } else {
    const activities = await Promise.all(
      repos.map((r) =>
        fetchGitHubActivity(token, login, r.fullName, r.branch, hoursBack, authorOnly)
      )
    );

    merged = {
      username: login,
      fetchedAt: new Date().toISOString(),
      commits: activities.flatMap((a) => a.commits),
      pullRequests: activities.flatMap((a) => a.pullRequests),
      hasActivity: activities.some((a) => a.hasActivity),
      warnings: activities.flatMap((a) => a.warnings ?? []),
    };
  }

  if (selectedShas && selectedShas.length > 0) {
    merged.commits = merged.commits.filter((c) => selectedShas.includes(c.sha));
  }

  const missingDiffs = merged.commits.filter((c) => !c.diff).slice(0, 15);
  const diffs = await Promise.all(
    missingDiffs.map((c) => fetchCommitDiff(token, c.repoName, c.sha))
  );
  const diffBySha = new Map(missingDiffs.map((c, i) => [c.sha, diffs[i]]));
  merged.commits = merged.commits.map((c) =>
    diffBySha.has(c.sha) ? { ...c, diff: diffBySha.get(c.sha) } : c
  );

  const finalActivity = sanitizeActivity(merged, sanitize);

  const [{ markdown, whatsappMessage, messages, tokenCount }, qualityScore] =
    await Promise.all([
      synthesizeWithGemini(
        finalActivity,
        persona,
        persona === "mis" ? clampMessageCount(messageCount) : 1
      ),
      scoreWithGemini(finalActivity),
    ]);

  const reposWithWork = [
    ...new Set(
      finalActivity.commits
        .map((commit) => commit.repoName)
        .concat(finalActivity.pullRequests.map((pullRequest) => pullRequest.repoName))
    ),
  ].filter(Boolean);

  return {
    markdown,
    whatsappMessage,
    messages,
    persona,
    generatedAt: new Date().toISOString(),
    repos: reposWithWork,
    activitySnapshot: {
      commitCount: finalActivity.commits.length,
      prCount: finalActivity.pullRequests.length,
    },
    tokenCount,
    qualityScore: qualityScore ?? undefined,
  };
}
