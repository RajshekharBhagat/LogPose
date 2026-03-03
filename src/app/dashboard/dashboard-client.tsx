"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { generateStandup, type RepoSelection } from "@/lib/actions/generate-standup";
import { fetchBranches } from "@/lib/actions/fetch-branches";
import { previewActivity } from "@/lib/actions/preview-activity";
import { saveJournal } from "@/lib/actions/save-journal";
import type { Persona, StandupState, StandupResult } from "@/types/standup";
import type { GitHubRepo, GitHubBranch, GitHubActivity } from "@/types/github";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  Save,
  Users,
  MessageCircle,
} from "lucide-react";

interface DashboardClientProps {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  repos: GitHubRepo[];
}

interface SelectedRepo {
  fullName: string;
  branch: string;
  branches: GitHubBranch[];
  branchesLoading: boolean;
}

const MAX_REPOS = 5;

export function DashboardClient({ user, repos }: DashboardClientProps) {
  // Multi-repo selection
  const [selectedRepos, setSelectedRepos] = useState<SelectedRepo[]>([]);
  const [activity, setActivity] = useState<GitHubActivity | null>(null);
  const [activityPending, startActivityTransition] = useTransition();

  // Sanitization toggle
  const [sanitizeEnabled, setSanitizeEnabled] = useState(false);

  // AI generation
  const [persona, setPersona] = useState<Persona>("peer");
  const [standupState, setStandupState] = useState<StandupState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Journal save
  const [savedToJournal, setSavedToJournal] = useState(false);
  const [savePending, startSaveTransition] = useTransition();

  function refreshPreview(repos: SelectedRepo[]) {
    const readyRepos = repos.filter((r) => r.branch);
    if (readyRepos.length === 0) {
      setActivity(null);
      return;
    }
    setActivity(null);
    startActivityTransition(async () => {
      try {
        const selections: RepoSelection[] = readyRepos.map((r) => ({
          fullName: r.fullName,
          branch: r.branch,
        }));
        const result = await previewActivity(selections);
        setActivity(result);
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
        const [branchList] = await Promise.all([fetchBranches(repoFullName)]);
        const repo = repos.find((r) => r.fullName === repoFullName);
        const defaultBranch = repo?.defaultBranch ?? branchList[0]?.name ?? "";

        setSelectedRepos((prev) => {
          const next = prev.map((r) =>
            r.fullName === repoFullName
              ? { ...r, branches: branchList, branch: defaultBranch, branchesLoading: false }
              : r
          );
          // Schedule preview outside the updater to avoid calling startTransition during render
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

  function handleGenerate() {
    const readyRepos = selectedRepos.filter((r) => r.branch);
    if (readyRepos.length === 0) return;
    setStandupState({ status: "loading" });
    setSavedToJournal(false);
    startTransition(async () => {
      try {
        const result = await generateStandup(
          persona,
          readyRepos.map((r) => ({ fullName: r.fullName, branch: r.branch })),
          sanitizeEnabled
        );
        setStandupState({ status: "success", result });
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

  function handleSaveToJournal(result: StandupResult) {
    startSaveTransition(async () => {
      try {
        await saveJournal(result);
        setSavedToJournal(true);
      } catch {
        // silently fail — saving is non-critical
      }
    });
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            {user.image && (
              <Image
                src={user.image}
                alt={user.name ?? "User avatar"}
                width={40}
                height={40}
                className="rounded-full ring-2 ring-primary/20"
                priority
              />
            )}
            <div>
              <p className="text-sm font-semibold leading-none text-foreground">
                {user.name ?? "GitHub User"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/journal">
              <Button variant="outline" size="sm" className="gap-2">
                <BookOpen className="size-3.5" />
                Journal
              </Button>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">

        {/* Step 1 — Grand Fleet: Repo & Branch selection */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-primary" />
                Grand Fleet — Select Repositories
              </CardTitle>
              <CardDescription>
                Choose up to {MAX_REPOS} repositories to analyse. Each gets its own branch selector.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Repo checklist */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {repos.map((repo, i) => {
                  const isChecked = selectedRepos.some((r) => r.fullName === repo.fullName);
                  const isDisabled = !isChecked && selectedRepos.length >= MAX_REPOS;
                  const sel = selectedRepos.find((r) => r.fullName === repo.fullName);

                  return (
                    <motion.div
                      key={repo.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2"
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
                          "flex flex-1 items-center gap-1.5 text-sm cursor-pointer select-none",
                          isDisabled ? "text-muted-foreground" : "text-foreground",
                        ].join(" ")}
                      >
                        {repo.private && <Lock className="size-3 text-muted-foreground shrink-0" />}
                        <span className="truncate">{repo.name}</span>
                      </label>

                      {/* Branch selector — only shown when repo is selected */}
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
                                <SelectTrigger className="h-8 w-40 text-xs">
                                  <span className="flex items-center gap-1">
                                    <GitBranch className="size-3 text-muted-foreground" />
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

        {/* Activity Preview — Observation Haki */}
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
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Observation Haki — Activity Preview</CardTitle>
                    {!activityPending && activity && (
                      <CardDescription>
                        {readyRepos.map((r) => r.fullName.split("/")[1]).join(", ")} · Last 24h
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
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
                          <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Commits ({activity.commits.length})
                          </span>
                        </div>
                        {activity.commits.length > 0 ? (
                          <ul className="space-y-1.5">
                            {activity.commits.map((c, i) => (
                              <motion.li
                                key={c.sha}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                                className="flex items-start gap-2"
                              >
                                <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-xs">
                                  {c.sha}
                                </Badge>
                                <span className="text-sm text-foreground">{c.message}</span>
                                <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                                  {c.repoName}
                                </Badge>
                              </motion.li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No commits in the last 24 hours.</p>
                        )}
                      </div>

                      <Separator />

                      {/* Pull Requests */}
                      <div>
                        <div className="mb-2 flex items-center gap-1.5">
                          <GitPullRequest className="size-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Pull Requests ({activity.pullRequests.length})
                          </span>
                        </div>
                        {activity.pullRequests.length > 0 ? (
                          <ul className="space-y-1.5">
                            {activity.pullRequests.map((pr, i) => (
                              <motion.li
                                key={pr.number}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                                className="flex items-start gap-2"
                              >
                                <Badge
                                  variant={
                                    pr.state === "merged"
                                      ? "default"
                                      : pr.state === "open"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="mt-0.5 shrink-0 text-xs"
                                >
                                  #{pr.number}
                                </Badge>
                                <span className="text-sm text-foreground">{pr.title}</span>
                                <Badge variant="outline" className="ml-auto shrink-0 text-xs capitalize">
                                  {pr.state}
                                </Badge>
                              </motion.li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No pull requests in the last 24 hours.</p>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Generate Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Persona toggle */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Summary Style
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={persona === "manager" ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => setPersona("manager")}
                    disabled={isLoading}
                  >
                    <Briefcase className="size-3.5" />
                    Manager Mode
                  </Button>
                  <Button
                    variant={persona === "peer" ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => setPersona("peer")}
                    disabled={isLoading}
                  >
                    <Code2 className="size-3.5" />
                    Peer Mode
                  </Button>
                  <Button
                    variant={persona === "client" ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => setPersona("client")}
                    disabled={isLoading}
                  >
                    <Users className="size-3.5" />
                    Client Mode
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

              {/* Privacy Filter */}
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Mask Sensitive Info</p>
                    <p className="text-xs text-muted-foreground">
                      Replaces IPs, emails, and secrets before sending to AI
                    </p>
                  </div>
                </div>
                <Switch
                  checked={sanitizeEnabled}
                  onCheckedChange={setSanitizeEnabled}
                  disabled={isLoading}
                />
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
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
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">AI Summary</CardTitle>
                      <Badge variant="secondary">
                        {standupState.result.persona === "manager"
                          ? "Manager Mode"
                          : standupState.result.persona === "client"
                          ? "Client Mode"
                          : "Peer Mode"}
                      </Badge>
                      {sanitizeEnabled && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Shield className="size-3" />
                          Sanitized
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {standupState.result.activitySnapshot.commitCount} commits &middot;{" "}
                        {standupState.result.activitySnapshot.prCount} PRs
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        title="Copy to clipboard"
                        className="size-8"
                      >
                        {copied ? (
                          <Check className="size-3.5 text-green-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
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
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <div className="[&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {standupState.result.markdown}
                    </ReactMarkdown>
                  </div>
                </CardContent>
                {/* Save to Journal */}
                <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-3">
                  {savedToJournal ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-600">
                      <Check className="size-3.5" />
                      Saved to Journal
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={savePending}
                      onClick={() =>
                        standupState.status === "success" &&
                        handleSaveToJournal(standupState.result)
                      }
                    >
                      {savePending ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Save to Journal
                    </Button>
                  )}
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
                <CardHeader className="pb-3">
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
                      {copiedWa ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
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
