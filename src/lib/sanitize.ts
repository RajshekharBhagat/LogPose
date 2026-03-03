import type { GitHubActivity, GitHubCommit, GitHubPullRequest } from "@/types/github";

const PATTERNS: [RegExp, string][] = [
  // IPv4 addresses
  [/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[IP_REDACTED]"],
  // Email addresses
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]"],
  // Long hex strings (40+ chars — git SHA-like, API keys)
  [/\b[0-9a-fA-F]{40,}\b/g, "[SECRET_REDACTED]"],
  // Bearer/token patterns (alphanum + special chars, 32+ chars)
  [/\b[A-Za-z0-9_\-]{32,}\b/g, "[SECRET_REDACTED]"],
  // UUID-like strings
  [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, "[SECRET_REDACTED]"],
];

function sanitizeText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function sanitizeActivity(
  activity: GitHubActivity,
  enabled: boolean
): GitHubActivity {
  if (!enabled) return activity;

  const commits: GitHubCommit[] = activity.commits.map((c) => ({
    ...c,
    message: sanitizeText(c.message),
  }));

  const pullRequests: GitHubPullRequest[] = activity.pullRequests.map((pr) => ({
    ...pr,
    title: sanitizeText(pr.title),
  }));

  return { ...activity, commits, pullRequests };
}
