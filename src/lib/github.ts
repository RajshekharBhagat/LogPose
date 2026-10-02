import type {
  GitHubActivity,
  GitHubCommit,
  GitHubPullRequest,
  GitHubSearchResponse,
  GitHubRepoRaw,
  GitHubRepo,
  GitHubBranch,
  GitHubRepoCommit,
} from "@/types/github";

const GITHUB_API = "https://api.github.com";

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
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
): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let nextUrl: string | null = url;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    const res = await fetch(nextUrl, {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) break;

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

  return repos;
}

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const headers = githubHeaders(token);
  const byId = new Map<number, GitHubRepo>();

  const direct = await fetchRepoPages(
    token,
    `${GITHUB_API}/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member`
  );
  for (const repo of direct) byId.set(repo.id, repo);

  const orgsRes = await fetch(`${GITHUB_API}/user/orgs?per_page=100`, {
    headers,
    cache: "no-store",
  });
  if (orgsRes.ok) {
    const orgs: { login: string }[] = await orgsRes.json();
    const orgRepos = await Promise.all(
      orgs.map((org) =>
        fetchRepoPages(
          token,
          `${GITHUB_API}/orgs/${encodeURIComponent(org.login)}/repos?sort=updated&per_page=100&type=member`
        )
      )
    );
    for (const repo of orgRepos.flat()) byId.set(repo.id, repo);
  }

  return [...byId.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
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

export async function fetchGitHubActivity(
  token: string,
  username: string,
  repoFullName: string,
  branch: string,
  hoursBack = 24,
  authorOnly = true
): Promise<GitHubActivity> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const commits: GitHubCommit[] = [];

  const authorParam = authorOnly ? `&author=${encodeURIComponent(username)}` : "";

  const raw: GitHubRepoCommit[] = [];
  for (let page = 1; page <= 10; page++) {
    const commitsRes = await fetch(
      `${GITHUB_API}/repos/${repoFullName}/commits?sha=${encodeURIComponent(branch)}&since=${since}${authorParam}&per_page=100&page=${page}`,
      { headers: githubHeaders(token), cache: "no-store" }
    );
    if (!commitsRes.ok) break;
    const pageRaw: GitHubRepoCommit[] = await commitsRes.json();
    if (!Array.isArray(pageRaw) || pageRaw.length === 0) break;
    raw.push(...pageRaw);
    if (pageRaw.length < 100) break;
  }

  for (const c of raw) {
    commits.push({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      repoName: repoFullName,
      url: c.html_url,
      timestamp: c.committer?.date ?? since,
    });
  }

  const diffTargets = raw.slice(0, 10);
  const diffs = await Promise.all(
    diffTargets.map((c) => fetchCommitDiff(token, repoFullName, c.sha))
  );
  for (let i = 0; i < diffTargets.length; i++) {
    commits[i].diff = diffs[i];
  }

  // Fetch PRs scoped to this repo
  const dateStr = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString().split("T")[0];
  const authorQuery = authorOnly ? `author:${username} ` : "";
  const query = encodeURIComponent(
    `${authorQuery}type:pr repo:${repoFullName} created:>${dateStr}`
  );
  const searchRes = await fetch(
    `${GITHUB_API}/search/issues?q=${query}&per_page=20&sort=created&order=desc`,
    { headers: githubHeaders(token), cache: "no-store" }
  );

  const pullRequests: GitHubPullRequest[] = [];

  if (searchRes.ok) {
    const data: GitHubSearchResponse = await searchRes.json();
    for (const item of data.items) {
      const isMerged = !!item.pull_request?.merged_at;
      pullRequests.push({
        number: item.number,
        title: item.title,
        repoName: repoFullName,
        state: isMerged ? "merged" : (item.state as "open" | "closed"),
        url: item.html_url,
        createdAt: item.created_at,
        mergedAt: item.pull_request?.merged_at ?? null,
      });
    }
  }

  return {
    username,
    fetchedAt: new Date().toISOString(),
    commits,
    pullRequests,
    hasActivity: commits.length > 0 || pullRequests.length > 0,
  };
}
