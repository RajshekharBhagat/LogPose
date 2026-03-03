"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { fetchRepoBranches } from "@/lib/github";
import type { GitHubBranch } from "@/types/github";

export async function fetchBranches(
  repoFullName: string
): Promise<GitHubBranch[]> {
  const session = await getServerSession(NextauthOptions);

  if (!session?.githubAccessToken) {
    throw new Error("Not authenticated. Please sign in again.");
  }

  return fetchRepoBranches(session.githubAccessToken, repoFullName);
}
