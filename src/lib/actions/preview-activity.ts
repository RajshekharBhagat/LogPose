"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  activitySince,
  fetchGitHubActivity,
  searchCommits,
  searchPullRequests,
} from "@/lib/github";
import type { GitHubActivity, GitHubCommit, GitHubPullRequest } from "@/types/github";
import type { RepoSelection } from "./generate-standup";

export async function previewActivity(
  repos: RepoSelection[],
  hoursBack = 24,
  authorOnly = true,
  overrideToken?: string,
  overrideLogin?: string
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

  const token = overrideToken ?? session.githubAccessToken;
  const login = overrideLogin ?? session.githubLogin;

  if (repos.length === 0) {
    return {
      username: login,
      fetchedAt: new Date().toISOString(),
      commits: [],
      pullRequests: [],
      hasActivity: false,
      warnings: [],
    };
  }

  const since = activitySince(hoursBack);
  const allowed = new Set(repos.map((r) => r.fullName.toLowerCase()));
  const warnings: string[] = [];

  if (authorOnly) {
    const [commitSearch, prSearch] = await Promise.all([
      searchCommits(token, `author:${login} committer-date:>=${since}`),
      searchPullRequests(
        token,
        `author:${login} type:pr created:>=${since.slice(0, 10)}`
      ),
    ]);
    if (commitSearch.error) warnings.push(commitSearch.error);
    if (prSearch.error) warnings.push(prSearch.error);

    const commits = commitSearch.commits.filter((c) =>
      allowed.has(c.repoName.toLowerCase())
    );
    const pullRequests = prSearch.pullRequests.filter((pr) =>
      allowed.has(pr.repoName.toLowerCase())
    );

    return {
      username: login,
      fetchedAt: new Date().toISOString(),
      commits,
      pullRequests,
      hasActivity: commits.length > 0 || pullRequests.length > 0,
      warnings,
    };
  }

  const activities: GitHubActivity[] = [];
  const batchSize = 2;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((r) =>
        fetchGitHubActivity(token, login, r.fullName, r.branch, hoursBack, false)
      )
    );
    activities.push(...results);
    if (results.some((a) => a.warnings?.some((w) => w.includes("rate limit")))) {
      warnings.push("GitHub rate limit reached. Showing the repositories fetched so far.");
      break;
    }
  }

  const commits: GitHubCommit[] = activities.flatMap((a) => a.commits);
  const pullRequests: GitHubPullRequest[] = activities.flatMap((a) => a.pullRequests);
  for (const warning of activities.flatMap((a) => a.warnings ?? [])) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }

  return {
    username: login,
    fetchedAt: new Date().toISOString(),
    commits,
    pullRequests,
    hasActivity: commits.length > 0 || pullRequests.length > 0,
    warnings,
  };
}
