"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { generateStandup, type RepoSelection } from "@/lib/actions/generate-standup";
import { fetchBranches } from "@/lib/actions/fetch-branches";
import { previewActivity } from "@/lib/actions/preview-activity";
import { saveJournal } from "@/lib/actions/save-journal";
import { getLinkedAccountToken, removeLinkedAccount, linkAccountWithPAT, type LinkedAccount } from "@/lib/actions/account-actions";
import { fetchReposForAccount } from "@/lib/actions/fetch-repos";
import type { Persona, StandupState, StandupResult } from "@/types/standup";
import type { GitHubRepo, GitHubBranch, GitHubActivity } from "@/types/github";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SignOutButton } from "./sign-out-button";
import {
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  Briefcase,
  Code2,
  GitBranch,
  BookOpen,
  Lock,
  GitCommitHorizontal,
  GitPullRequest,
  Shield,
  Users,
  MessageCircle,
  ChevronDown,
  UserPlus,
  Trash2,
  Trophy,
} from "lucide-react";

interface DashboardClientProps {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
    login: string | null;
  };
  repos: GitHubRepo[];
  linkedAccounts: LinkedAccount[];
}

interface SelectedRepo {
  fullName: string;
  branch: string;
  branches: GitHubBranch[];
  branchesLoading: boolean;
}

const MAX_REPOS = 5;

const HOURS_OPTIONS = [
  { label: "Last 24h", value: 24 },
  { label: "Last 48h", value: 48 },
  { label: "Last 72h", value: 72 },
  { label: "Last 7 days", value: 168 },
];

const LS_KEY = "logpose_active_account";

export function DashboardClient({ user, repos, linkedAccounts: initialLinkedAccounts }: DashboardClientProps) {
  // Account switcher
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>(initialLinkedAccounts);
  const [activeAccount, setActiveAccount] = useState<{ login: string; token: string } | null>(null);
  const [activeRepos, setActiveRepos] = useState<GitHubRepo[]>(repos);
  const [reposLoading, setReposLoading] = useState(false);
  const restoredRef = useRef(false);

  // On mount: restore persisted active account
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    const { login } = JSON.parse(saved) as { login: string };
    if (login && login !== user.login) {
      getLinkedAccountToken(login)
        .then((token) => {
          setActiveAccount({ login, token });
          loadReposForToken(token);
        })
        .catch(() => localStorage.removeItem(LS_KEY));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadReposForToken(token: string) {
    setReposLoading(true);
    fetchReposForAccount(token)
      .then((r) => setActiveRepos(r))
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }

  // Multi-repo selection
  const [selectedRepos, setSelectedRepos] = useState<SelectedRepo[]>([]);
  const [activity, setActivity] = useState<GitHubActivity | null>(null);
  const [activityPending, startActivityTransition] = useTransition();

  // Filters
  const [authorOnly, setAuthorOnly] = useState(true);
  const [hoursBack, setHoursBack] = useState(24);
  const [selectedShas, setSelectedShas] = useState<Set<string>>(new Set());

  // Sanitization toggle
  // AI generation
  const [persona, setPersona] = useState<Persona>("peer");
  const [standupState, setStandupState] = useState<StandupState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [isPending, startTransition] = useTransition();

  // PAT link form
  const [showPatForm, setShowPatForm] = useState(false);
  const [patValue, setPatValue] = useState("");
  const [patError, setPatError] = useState("");
  const [patPending, startPatTransition] = useTransition();

  const activeLogin = activeAccount?.login ?? user.login ?? "me";
  const activeToken = activeAccount?.token ?? undefined; // undefined = use session default

  async function switchToAccount(login: string) {
    if (login === user.login) {
      setActiveAccount(null);
      setActiveRepos(repos);
      setSelectedRepos([]);
      setActivity(null);
      localStorage.removeItem(LS_KEY);
      return;
    }
    try {
      const token = await getLinkedAccountToken(login);
      setActiveAccount({ login, token });
      setSelectedRepos([]);
      setActivity(null);
      localStorage.setItem(LS_KEY, JSON.stringify({ login }));
      loadReposForToken(token);
    } catch {
      // silently ignore
    }
  }

  async function handleRemoveLinked(login: string) {
    await removeLinkedAccount(login);
    setLinkedAccounts((prev) => prev.filter((a) => a.github_login !== login));
    if (activeAccount?.login === login) {
      setActiveAccount(null);
      setActiveRepos(repos);
      setSelectedRepos([]);
      setActivity(null);
      localStorage.removeItem(LS_KEY);
    }
  }

  function handleLinkPAT() {
    if (!patValue.trim()) return;
    setPatError("");
    startPatTransition(async () => {
      try {
        const { github_login } = await linkAccountWithPAT(patValue.trim());
        setLinkedAccounts((prev) => {
          if (prev.some((a) => a.github_login === github_login)) return prev;
          return [...prev, { github_login }];
        });
        setPatValue("");
        setShowPatForm(false);
      } catch (err) {
        setPatError(err instanceof Error ? err.message : "Failed to link account.");
      }
    });
  }

  function refreshPreview(repos: SelectedRepo[], hours = hoursBack, myOnly = authorOnly) {
    const readyRepos = repos.filter((r) => r.branch);
    if (readyRepos.length === 0) {
      setActivity(null);
      setSelectedShas(new Set());
      return;
    }
    setActivity(null);
    setSelectedShas(new Set());
    startActivityTransition(async () => {
      try {
        const selections: RepoSelection[] = readyRepos.map((r) => ({
          fullName: r.fullName,
          branch: r.branch,
        }));
        const result = await previewActivity(selections, hours, myOnly, activeToken, activeToken ? activeLogin : undefined);
        setActivity(result);
        setSelectedShas(new Set(result.commits.map((c) => c.sha)));
      } catch {
        // silently fail — preview is non-critical
      }
    });
  }

  async function handleRepoToggle(repoFullName: string, checked: boolean) {
    if (checked) {
      if (selectedRepos.length >= MAX_REPOS) return;

      const newEntry: SelectedRepo = {
        fullName: repoFullName,
        branch: "",
        branches: [],
        branchesLoading: true,
      };

      const updated = [...selectedRepos, newEntry];
      setSelectedRepos(updated);
      setStandupState({ status: "idle" });

      try {
        const branchList = await fetchBranches(repoFullName, activeToken);
        const repo = activeRepos.find((r) => r.fullName === repoFullName);
        const defaultBranch = repo?.defaultBranch ?? branchList[0]?.name ?? "";

        setSelectedRepos((prev) => {
          const next = prev.map((r) =>
            r.fullName === repoFullName
              ? { ...r, branches: branchList, branch: defaultBranch, branchesLoading: false }
              : r
          );
          setTimeout(() => refreshPreview(next), 0);
          return next;
        });
      } catch {
        setSelectedRepos((prev) =>
          prev.map((r) =>
            r.fullName === repoFullName ? { ...r, branchesLoading: false } : r
          )
        );
      }
    } else {
      const updated = selectedRepos.filter((r) => r.fullName !== repoFullName);
      setSelectedRepos(updated);
      setStandupState({ status: "idle" });
      refreshPreview(updated);
    }
  }

  function handleBranchChange(repoFullName: string, branch: string) {
    const next = selectedRepos.map((r) =>
      r.fullName === repoFullName ? { ...r, branch } : r
    );
    setSelectedRepos(next);
    setStandupState({ status: "idle" });
    refreshPreview(next);
  }

  function handleHoursChange(val: string) {
    const hours = Number(val);
    setHoursBack(hours);
    setStandupState({ status: "idle" });
    refreshPreview(selectedRepos, hours, authorOnly);
  }

  function handleAuthorOnlyChange(checked: boolean) {
    setAuthorOnly(checked);
    setStandupState({ status: "idle" });
    refreshPreview(selectedRepos, hoursBack, checked);
  }

  function toggleSha(sha: string) {
    setSelectedShas((prev) => {
      const next = new Set(prev);
      next.has(sha) ? next.delete(sha) : next.add(sha);
      return next;
    });
  }

  function handleGenerate() {
    const readyRepos = selectedRepos.filter((r) => r.branch);
    if (readyRepos.length === 0) return;
    setStandupState({ status: "loading" });
    startTransition(async () => {
      try {
        const result = await generateStandup(
          persona,
          readyRepos.map((r) => ({ fullName: r.fullName, branch: r.branch })),
          true, // always sanitize
          hoursBack,
          authorOnly,
          selectedShas.size > 0 ? Array.from(selectedShas) : undefined,
          activeToken,
          activeToken ? activeLogin : undefined
        );
        setStandupState({ status: "success", result });
        // Auto-save to journal
        saveJournal(result).catch(() => {});
      } catch (err) {
        setStandupState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Something went wrong. Please try again.",
        });
      }
    });
  }

  function handleCopy() {
    if (standupState.status !== "success") return;
    navigator.clipboard.writeText(standupState.result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyWa() {
    if (standupState.status !== "success") return;
    navigator.clipboard.writeText(standupState.result.whatsappMessage);
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2000);
  }

  const isLoading = isPending || standupState.status === "loading";
  const readyRepos = selectedRepos.filter((r) => r.branch);
  const canGenerate = readyRepos.length > 0 && !isLoading && !activityPending;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const hoursLabel = HOURS_OPTIONS.find((o) => o.value === hoursBack)?.label ?? "Last 24h";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card py-3 px-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Account switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors min-w-0">
                  {user.image && (
                    <Image
                      src={user.image}
                      alt={user.name ?? "User avatar"}
                      width={32}
                      height={32}
                      className="rounded-full ring-2 ring-primary/20 shrink-0"
                      priority
                    />
                  )}
                  <div className="text-left min-w-0 hidden sm:block">
                    <p className="text-sm font-semibold leading-none text-foreground truncate">
                      {activeAccount?.login ?? user.name ?? "GitHub User"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{today}</p>
                  </div>
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">GitHub Accounts</DropdownMenuLabel>
                {/* Primary account */}
                <DropdownMenuItem
                  onClick={() => switchToAccount(user.login ?? "")}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-sm truncate">{user.login ?? user.name} (primary)</span>
                  {!activeAccount && <Check className="size-3.5 text-primary shrink-0" />}
                </DropdownMenuItem>
                {/* Linked accounts */}
                {linkedAccounts.map((acc) => (
                  <DropdownMenuItem
                    key={acc.github_login}
                    className="flex items-center justify-between gap-2 group"
                    onSelect={(e) => e.preventDefault()}
                  >
                    <button
                      className="flex-1 text-left text-sm truncate"
                      onClick={() => switchToAccount(acc.github_login)}
                    >
                      {acc.github_login}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {activeAccount?.login === acc.github_login && (
                        <Check className="size-3.5 text-primary" />
                      )}
                      <button
                        onClick={() => handleRemoveLinked(acc.github_login)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove account"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {/* PAT link form */}
                {showPatForm ? (
                  <div className="px-2 py-2 space-y-2" onKeyDown={(e) => e.stopPropagation()}>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Paste a GitHub{" "}
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=LogPose"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Personal Access Token
                      </a>{" "}
                      with <code className="text-xs">repo</code> &amp; <code className="text-xs">read:user</code> scopes.
                    </p>
                    <Input
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={patValue}
                      onChange={(e) => setPatValue(e.target.value)}
                      className="h-7 text-xs font-mono"
                      autoFocus
                    />
                    {patError && (
                      <p className="text-xs text-destructive">{patError}</p>
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={handleLinkPAT}
                        disabled={patPending || !patValue.trim()}
                      >
                        {patPending ? (
                          <span className="size-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        ) : "Link"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => { setShowPatForm(false); setPatValue(""); setPatError(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setShowPatForm(true); }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <UserPlus className="size-3.5" />
                    Add GitHub Account
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <SignOutButton />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl space-y-3 md:space-y-4 p-3 md:p-4">

        {/* Nav links */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/team">
            <Button variant="outline" size="sm" className="gap-2">
              <Users className="size-3.5" />
              <span className="text-xs sm:text-sm">Team</span>
            </Button>
          </Link>
          <Link href="/leaderboard">
            <Button variant="outline" size="sm" className="gap-2">
              <Trophy className="size-3.5" />
              <span className="text-xs sm:text-sm">Leaderboard</span>
            </Button>
          </Link>
          <Link href="/journal">
            <Button variant="outline" size="sm" className="gap-2">
              <BookOpen className="size-3.5" />
              <span className="text-xs sm:text-sm">Journal</span>
            </Button>
          </Link>
          {activeAccount && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Users className="size-3" />
              Viewing as {activeAccount.login}
            </Badge>
          )}
        </div>

        {/* Step 1 — Repo & Branch selection */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-primary" />
                Select Repositories
              </CardTitle>
              <CardDescription>
                Choose up to {MAX_REPOS} repositories to track. Each gets its own branch selector.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              {/* Repo checklist */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {reposLoading ? (
                  <div className="space-y-2">
                    {[1,2,3].map((n) => <Skeleton key={n} className="h-9 w-full" />)}
                  </div>
                ) : activeRepos.map((repo, i) => {
                  const isChecked = selectedRepos.some((r) => r.fullName === repo.fullName);
                  const isDisabled = !isChecked && selectedRepos.length >= MAX_REPOS;
                  const sel = selectedRepos.find((r) => r.fullName === repo.fullName);

                  return (
                    <motion.div
                      key={repo.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2"
                    >
                      <Checkbox
                        id={`repo-${repo.id}`}
                        checked={isChecked}
                        disabled={isDisabled}
                        onCheckedChange={(checked) =>
                          handleRepoToggle(repo.fullName, !!checked)
                        }
                      />
                      <label
                        htmlFor={`repo-${repo.id}`}
                        className={[
                          "flex flex-1 min-w-0 items-center gap-1.5 text-sm cursor-pointer select-none",
                          isDisabled ? "text-muted-foreground" : "text-foreground",
                        ].join(" ")}
                      >
                        {repo.private && <Lock className="size-3 text-muted-foreground shrink-0" />}
                        <span className="truncate">{repo.name}</span>
                      </label>

                      {/* Branch selector */}
                      <AnimatePresence>
                        {isChecked && sel && (
                          <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="shrink-0"
                          >
                            {sel.branchesLoading ? (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
                                <span className="size-3 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                                Loading…
                              </span>
                            ) : (
                              <Select
                                value={sel.branch}
                                onValueChange={(b) => handleBranchChange(repo.fullName, b)}
                              >
                                <SelectTrigger className="h-8 w-28 sm:w-40 text-xs">
                                  <span className="flex items-center gap-1 min-w-0">
                                    <GitBranch className="size-3 text-muted-foreground shrink-0" />
                                    <SelectValue placeholder="Branch" />
                                  </span>
                                </SelectTrigger>
                                <SelectContent>
                                  {sel.branches.map((branch) => (
                                    <SelectItem key={branch.name} value={branch.name} className="text-xs">
                                      {branch.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={authorOnly}
                    onCheckedChange={(c) => handleAuthorOnlyChange(!!c)}
                  />
                  <span className="text-sm text-foreground">My commits only</span>
                </label>
                <span className="text-xs text-muted-foreground hidden sm:inline">·</span>
                <Select value={String(hoursBack)} onValueChange={handleHoursChange}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRepos.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedRepos.length} of {MAX_REPOS} repos selected
                  {readyRepos.length < selectedRepos.length && (
                    <span className="text-amber-500"> · waiting for branch selection</span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity Preview */}
        <AnimatePresence>
          {(activityPending || activity !== null) && (
            <motion.div
              key="activity-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card>
                <CardHeader className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <CardTitle className="text-base">Activity Preview</CardTitle>
                    {!activityPending && activity && (
                      <CardDescription className="sm:text-right">
                        {readyRepos.map((r) => r.fullName.split("/")[1]).join(", ")} · {hoursLabel}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  {activityPending ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : activity && (
                    <div className="space-y-4">
                      {/* Commits */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <GitCommitHorizontal className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Commits ({activity.commits.length})
                          </span>
                          {activity.commits.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              · {selectedShas.size} selected
                            </span>
                          )}
                        </div>
                        {activity.commits.length > 0 ? (
                          <ul className="space-y-5">
                            {activity.commits.map((c, i) => (
                              <motion.li
                                key={c.sha}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                                className="flex items-start gap-2"
                              >
                                <Checkbox
                                  checked={selectedShas.has(c.sha)}
                                  onCheckedChange={() => toggleSha(c.sha)}
                                  className="mt-0.5 shrink-0"
                                />
                                <div className="flex flex-col md:flex-row items-start gap-x-2 gap-y-1 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant="outline" className="shrink-0 font-mono text-xs">
                                    {c.sha}
                                  </Badge>
                                  <Badge variant="secondary" className="shrink-0 text-xs order-1">
                                    {c.repoName.split("/")[1] ?? c.repoName}
                                  </Badge>
                                  </div>
                                  <span className="flex-1 min-w-0 text-sm text-foreground break-words">
                                    {c.message}
                                  </span>
                                </div>
                              </motion.li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No commits in the selected range.</p>
                        )}
                      </div>

                      <Separator />

                      {/* Pull Requests */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <GitPullRequest className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Pull Requests ({activity.pullRequests.length})
                          </span>
                        </div>
                        {activity.pullRequests.length > 0 ? (
                          <ul className="space-y-2">
                            {activity.pullRequests.map((pr, i) => (
                              <motion.li
                                key={pr.number}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                                className="flex flex-wrap items-start gap-x-2 gap-y-1"
                              >
                                <Badge
                                  variant={
                                    pr.state === "merged"
                                      ? "default"
                                      : pr.state === "open"
                                        ? "secondary"
                                        : "outline"
                                  }
                                  className="shrink-0 text-xs"
                                >
                                  #{pr.number}
                                </Badge>
                                <span className="flex-1 min-w-0 text-sm text-foreground break-words">
                                  {pr.title}
                                </span>
                                <Badge variant="outline" className="shrink-0 text-xs capitalize">
                                  {pr.state}
                                </Badge>
                              </motion.li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No pull requests in the selected range.</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 2 — Generate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
        >
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Generate Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-3">
              {/* Persona toggle */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Summary Style
                </p>
                <div className="flex overflow-x-auto gap-2 pb-1">
                  <Button
                    variant={persona === "manager" ? "default" : "outline"}
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => setPersona("manager")}
                    disabled={isLoading}
                  >
                    <Briefcase className="size-3.5" />
                    Manager
                  </Button>
                  <Button
                    variant={persona === "peer" ? "default" : "outline"}
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => setPersona("peer")}
                    disabled={isLoading}
                  >
                    <Code2 className="size-3.5" />
                    Peer
                  </Button>
                  <Button
                    variant={persona === "client" ? "default" : "outline"}
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => setPersona("client")}
                    disabled={isLoading}
                  >
                    <Users className="size-3.5" />
                    Client
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {persona === "manager"
                    ? "High-level business impact — suitable for product managers and stakeholders."
                    : persona === "client"
                      ? "Outcome-only bullets for non-technical clients — plain English, under 40 words."
                      : "Technical detail — suitable for engineers, PRs, and team leads."}
                </p>
              </div>

              <Separator />

              {/* Always-on privacy indicator */}
              <div className="flex items-center gap-2.5 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                <div className="relative shrink-0">
                  <Shield className="size-3.5 text-green-600 dark:text-green-400" />
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-green-500 animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-green-600 dark:text-green-400">Privacy active</span>
                  {" — "}IPs, emails &amp; secrets are masked before sending to AI
                </p>
              </div>

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isLoading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    Analyzing your activity...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Today&apos;s Summary
                  </>
                )}
              </Button>

              {selectedRepos.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Select at least one repository above to get started.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Loading skeleton */}
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Error state */}
        {standupState.status === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{standupState.message}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Success state */}
        <AnimatePresence>
          {standupState.status === "success" && !isLoading && (
            <motion.div
              key="result-card"
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">AI Summary</CardTitle>
                      <Badge variant="secondary">
                        {standupState.result.persona === "manager"
                          ? "Manager"
                          : standupState.result.persona === "client"
                            ? "Client"
                            : "Peer"}
                      </Badge>
                      <Badge variant="outline" className="gap-1 text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-800">
                        <Shield className="size-3" />
                        Sanitized
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {standupState.result.activitySnapshot.commitCount} commits &middot;{" "}
                        {standupState.result.activitySnapshot.prCount} PRs
                        {standupState.result.tokenCount > 0 && (
                          <> &middot; ~{standupState.result.tokenCount.toLocaleString()} tokens</>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        title="Copy to clipboard"
                        className="size-8"
                      >
                        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                      </Button>
                    </div>
                  </div>
                  {/* Repo tags */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {standupState.result.repos.map((repo) => (
                      <Badge key={repo} variant="outline" className="text-xs font-mono">
                        {repo.split("/")[1] ?? repo}
                      </Badge>
                    ))}
                  </div>
                  {/* Quality score */}
                  {standupState.result.qualityScore && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "text-sm font-semibold",
                            standupState.result.qualityScore.total_score >= 75
                              ? "text-green-600 dark:text-green-400"
                              : standupState.result.qualityScore.total_score >= 50
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-red-600 dark:text-red-400",
                          ].join(" ")}
                        >
                          Quality Score: {standupState.result.qualityScore.total_score}/100
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Functionality: {standupState.result.qualityScore.breakdown.functionality}/40
                          {" · "}Best Practices: {standupState.result.qualityScore.breakdown.quality}/40
                          {" · "}Scalability: {standupState.result.qualityScore.breakdown.scalability}/20
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {standupState.result.qualityScore.critical_feedback}
                      </p>
                    </div>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="pt-4 px-3 md:px-6">
                  <div className="[&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {standupState.result.markdown}
                    </ReactMarkdown>
                  </div>
                </CardContent>
                {/* Auto-saved indicator */}
                <div className="flex items-center gap-1.5 border-t border-border/60 px-3 md:px-6 py-2.5">
                  <Check className="size-3 text-green-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">Saved to journal</span>
                </div>
              </Card>
            </motion.div>
          )}

          {/* WhatsApp Message card */}
          {standupState.status === "success" && !isLoading && standupState.result.whatsappMessage && (
            <motion.div
              key="whatsapp-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
            >
              <Card>
                <CardHeader className="pb-3 px-3 md:px-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
                      <MessageCircle className="size-4" />
                      WhatsApp Message
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={handleCopyWa}
                      title="Copy WhatsApp message"
                    >
                      {copiedWa ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-3 md:px-6">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {standupState.result.whatsappMessage}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
