export interface GitHubCommit {
  sha: string;
  message: string;
  repoName: string;
  url: string;
  timestamp: string;
  diff?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  repoName: string;
  state: "open" | "closed" | "merged";
  url: string;
  createdAt: string;
  mergedAt: string | null;
}

export interface GitHubActivity {
  username: string;
  fetchedAt: string;
  commits: GitHubCommit[];
  pullRequests: GitHubPullRequest[];
  hasActivity: boolean;
}

// Raw GitHub Events API shapes (partial)
export interface GitHubEventCommit {
  sha: string;
  message: string;
  url: string;
}

export interface GitHubEvent {
  type: string;
  repo: { name: string };
  payload: {
    commits?: GitHubEventCommit[];
  };
  created_at: string;
}

// Raw GitHub Search API shapes (partial)
export interface GitHubSearchIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  pull_request?: {
    merged_at: string | null;
    url: string;
  };
  repository_url: string;
  created_at: string;
}

export interface GitHubSearchResponse {
  total_count: number;
  items: GitHubSearchIssue[];
}

// Raw GitHub Repos API shape (partial)
export interface GitHubRepoRaw {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  updated_at: string;
  default_branch: string;
}

// Raw GitHub Commits API shape (partial)
export interface GitHubRepoCommit {
  sha: string;
  commit: { message: string };
  html_url: string;
  committer: { date: string } | null;
}

// App-level types
export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  updatedAt: string;
  defaultBranch: string;
}

export interface GitHubBranch {
  name: string;
}
