import type {
  GitHubActivity,
  GitHubCommit,
  GitHubPullRequest,
  GitHubRepoRaw,
  GitHubRepo,
  GitHubBranch,
} from "@/types/github";

const GITHUB_API = "https://api.github.com";

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readGithubError(res: Response): Promise<string> {
  const remaining = res.headers.get("x-ratelimit-remaining");
  let message = `GitHub request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // Response body was not JSON.
  }
  if (res.status === 403 && remaining === "0") {
    return "GitHub rate limit reached. Wait a minute and try again.";
  }
  if (
    res.status === 403 &&
    /organization|saml|oauth app access|resource not accessible/i.test(message)
  ) {
    return "An organization has not approved Log Pose. Grant access in GitHub Settings → Applications.";
  }
  return message;
}

function toRepo(r: GitHubRepoRaw): GitHubRepo {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    updatedAt: r.updated_at,
    defaultBranch: r.default_branch,
  };
}

async function fetchRepoPages(
  token: string,
  url: string,
  maxPages = 10
): Promise<{ repos: GitHubRepo[]; error: string | null }> {
  const repos: GitHubRepo[] = [];
  let error: string | null = null;
  let nextUrl: string | null = url;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    const res: Response = await fetch(nextUrl, {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) {
      error = await readGithubError(res);
      break;
    }

    const raw: GitHubRepoRaw[] = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) break;
    repos.push(...raw.map(toRepo));

    const link = res.headers.get("link") ?? "";
    const next = link
      .split(",")
      .find((part) => part.includes('rel="next"'));
    const match = next?.match(/<([^>]+)>/);
    nextUrl = match?.[1] ?? null;
  }

  return { repos, error };
}

export interface RepoListResult {
  repos: GitHubRepo[];
  error: string | null;
}

export async function fetchUserRepos(token: string): Promise<RepoListResult> {
  const headers = githubHeaders(token);
  const byId = new Map<number, GitHubRepo>();
  const errors: string[] = [];

  const direct = await fetchRepoPages(
    token,
    `${GITHUB_API}/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member`
  );
  for (const repo of direct.repos) byId.set(repo.id, repo);
  if (direct.error) errors.push(direct.error);

  const orgsRes = await fetch(`${GITHUB_API}/user/orgs?per_page=100`, {
    headers,
    cache: "no-store",
  });
  if (!orgsRes.ok) {
    errors.push(await readGithubError(orgsRes));
  } else {
    const orgs: { login: string }[] = await orgsRes.json();
    const orgResults = await Promise.all(
      orgs.map((org) =>
        fetchRepoPages(
          token,
          `${GITHUB_API}/orgs/${encodeURIComponent(org.login)}/repos?sort=updated&per_page=100&type=member`
        )
      )
    );
    for (const result of orgResults) {
      for (const repo of result.repos) byId.set(repo.id, repo);
      if (result.error) errors.push(result.error);
    }
  }

  const uniqueErrors = [...new Set(errors)];
  return {
    repos: [...byId.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    ),
    error: uniqueErrors.length > 0 ? uniqueErrors.join(" ") : null,
  };
}

export async function fetchRepoBranches(
  token: string,
  repoFullName: string
): Promise<GitHubBranch[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repoFullName}/branches?per_page=100`,
    { headers: githubHeaders(token), cache: "no-store" }
  );
  if (!res.ok) return [];
  const raw: { name: string }[] = await res.json();
  return raw.map((b) => ({ name: b.name }));
}

export async function fetchCommitDiff(
  token: string,
  repoFullName: string,
  sha: string
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repoFullName}/commits/${sha}`,
    {
      headers: {
        ...githubHeaders(token),
        Accept: "application/vnd.github.diff",
      },
      cache: "no-store",
    }
  );
  if (!res.ok) return "";
  return res.text();
}

interface SearchCommitItem {
  sha: string;
  html_url: string;
  commit: { message: string; committer: { date: string } | null };
  repository: { full_name: string };
}

interface SearchIssueItem {
  number: number;
  title: string;
  state: string;
  html_url: string;
  repository_url: string;
  created_at: string;
  pull_request?: { merged_at: string | null };
}

function repoFromApiUrl(url: string): string {
  const marker = "/repos/";
  const index = url.indexOf(marker);
  return index === -1 ? url : url.slice(index + marker.length);
}

export function activitySince(hoursBack: number): string {
  return new Date(Date.now() - hoursBack * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

export async function searchCommits(
  token: string,
  query: string
): Promise<{ commits: GitHubCommit[]; error: string | null }> {
  const commits: GitHubCommit[] = [];
  let error: string | null = null;

  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `${GITHUB_API}/search/commits?q=${encodeURIComponent(query)}&sort=committer-date&order=desc&per_page=100&page=${page}`,
      { headers: githubHeaders(token), cache: "no-store" }
    );
    if (!res.ok) {
      error = await readGithubError(res);
      break;
    }
    const data = (await res.json()) as { items?: SearchCommitItem[] };
    const items = data.items ?? [];
    for (const item of items) {
      commits.push({
        sha: item.sha.slice(0, 7),
        message: item.commit.message.split("\n")[0],
        repoName: item.repository.full_name,
        url: item.html_url,
        timestamp: item.commit.committer?.date ?? "",
      });
    }
    if (items.length < 100) break;
  }

  return { commits, error };
}

export async function searchPullRequests(
  token: string,
  query: string
): Promise<{ pullRequests: GitHubPullRequest[]; error: string | null }> {
  const pullRequests: GitHubPullRequest[] = [];
  let error: string | null = null;

  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&sort=created&order=desc&per_page=100&page=${page}`,
      { headers: githubHeaders(token), cache: "no-store" }
    );
    if (!res.ok) {
      error = await readGithubError(res);
      break;
    }
    const data = (await res.json()) as { items?: SearchIssueItem[] };
    const items = (data.items ?? []).filter((item) => item.pull_request);
    for (const item of items) {
      const isMerged = !!item.pull_request?.merged_at;
      pullRequests.push({
        number: item.number,
        title: item.title,
        repoName: repoFromApiUrl(item.repository_url),
        state: isMerged ? "merged" : (item.state as "open" | "closed"),
        url: item.html_url,
        createdAt: item.created_at,
        mergedAt: item.pull_request?.merged_at ?? null,
      });
    }
    if ((data.items ?? []).length < 100) break;
  }

  return { pullRequests, error };
}

export async function fetchGitHubActivity(
  token: string,
  username: string,
  repoFullName: string,
  branch: string,
  hoursBack = 24,
  authorOnly = true
): Promise<GitHubActivity> {
  void branch;
  const since = activitySince(hoursBack);
  const warnings: string[] = [];
  const commits: GitHubCommit[] = [];

  const authorQuery = authorOnly ? `author:${username} ` : "";
  const commitSearch = await searchCommits(
    token,
    `${authorQuery}repo:${repoFullName} committer-date:>=${since}`
  );
  if (commitSearch.error) warnings.push(commitSearch.error);
  commits.push(...commitSearch.commits);

  const diffTargets = commits.slice(0, 10);
  const diffs = await Promise.all(
    diffTargets.map((c) => fetchCommitDiff(token, repoFullName, c.sha))
  );
  for (let i = 0; i < diffTargets.length; i++) {
    commits[i].diff = diffs[i];
  }

  const dateStr = since.slice(0, 10);
  const prSearch = await searchPullRequests(
    token,
    `${authorQuery}type:pr repo:${repoFullName} created:>=${dateStr}`
  );
  if (prSearch.error) warnings.push(prSearch.error);

  return {
    username,
    fetchedAt: new Date().toISOString(),
    commits,
    pullRequests: prSearch.pullRequests,
    hasActivity: commits.length > 0 || prSearch.pullRequests.length > 0,
    warnings,
  };
}
