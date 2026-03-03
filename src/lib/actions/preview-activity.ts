"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchGitHubActivity } from "@/lib/github";
import type { GitHubActivity } from "@/types/github";
import type { RepoSelection } from "./generate-standup";

export async function previewActivity(
  repos: RepoSelection[]
): Promise<GitHubActivity> {
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
    return {
      username: session.githubLogin,
      fetchedAt: new Date().toISOString(),
      commits: [],
      pullRequests: [],
      hasActivity: false,
    };
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

  return {
    username: activities[0].username,
    fetchedAt: new Date().toISOString(),
    commits: activities.flatMap((a) => a.commits),
    pullRequests: activities.flatMap((a) => a.pullRequests),
    hasActivity: activities.some((a) => a.hasActivity),
  };
}
