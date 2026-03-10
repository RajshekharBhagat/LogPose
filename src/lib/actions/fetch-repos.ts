"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchUserRepos } from "@/lib/github";
import type { GitHubRepo } from "@/types/github";

export async function fetchReposForAccount(
  overrideToken?: string
): Promise<GitHubRepo[]> {
  const session = await getServerSession(NextauthOptions);

  if (!session?.githubAccessToken) {
    throw new Error("Not authenticated. Please sign in again.");
  }

  const token = overrideToken ?? session.githubAccessToken;
  return fetchUserRepos(token);
}
