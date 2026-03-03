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

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?sort=updated&per_page=100&type=all`,
    { headers: githubHeaders(token), cache: "no-store" }
  );
  if (!res.ok) return [];
  const raw: GitHubRepoRaw[] = await res.json();
  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    updatedAt: r.updated_at,
    defaultBranch: r.default_branch,
  }));
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

export async function fetchGitHubActivity(
  token: string,
  username: string,
  repoFullName: string,
  branch: string
): Promise<GitHubActivity> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const commits: GitHubCommit[] = [];

  // Fetch commits for the specific repo + branch
  const commitsRes = await fetch(
    `${GITHUB_API}/repos/${repoFullName}/commits?sha=${encodeURIComponent(branch)}&since=${since}&per_page=50`,
    { headers: githubHeaders(token), cache: "no-store" }
  );

  if (commitsRes.ok) {
    const raw: GitHubRepoCommit[] = await commitsRes.json();
    for (const c of raw) {
      commits.push({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        repoName: repoFullName,
        url: c.html_url,
        timestamp: c.committer?.date ?? since,
      });
    }
  }

  // Fetch PRs scoped to this repo
  const dateStr = yesterdayISO();
  const query = encodeURIComponent(
    `author:${username} type:pr repo:${repoFullName} created:>${dateStr}`
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
