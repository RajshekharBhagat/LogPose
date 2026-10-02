"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
import { personaLabel, type MessageCount, type Persona, type StandupState, type StandupResult } from "@/types/standup";
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
import { ThemeToggle } from "@/components/theme-toggle";
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
  RefreshCw,
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
  repoError: string | null;
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
  { label: "Last 12h", value: 12 },
  { label: "Last 24h", value: 24 },
  { label: "Last 48h", value: 48 },
  { label: "Last 72h", value: 72 },
  { label: "Last 7 days", value: 168 },
];

const LS_KEY = "logpose_active_account";
const PREFS_KEY = "logpose_dashboard_prefs";

function formatUpdated(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface DashboardPrefs {
  login: string;
  hoursBack: number;
  authorOnly: boolean;
  repos: { fullName: string; branch: string }[];
}

function BranchPicker({
  branches,
  value,
  loading,
  defaultBranch,
  onChange,
}: {
  branches: GitHubBranch[];
  value: string;
  loading: boolean;
  defaultBranch: string;
  onChange: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? branches.filter((branch) => branch.name.toLowerCase().includes(needle))
    : branches;

  function placeMenu() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, Math.min(320, openBelow ? spaceBelow : spaceAbove));
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - margin * 2);
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;
    setMenuStyle(
      openBelow
        ? { top: rect.bottom + gap, left, width, maxHeight }
        : { bottom: window.innerHeight - rect.top + gap, left, width, maxHeight }
    );
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    function onScroll(event: Event) {
      if (menuRef.current?.contains(event.target as Node)) return;
      placeMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (loading) {
    return (
      <span className="flex h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <span className="size-3 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        Loading branches…
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-left text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <GitBranch className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value || "Choose a branch"}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="fixed z-50 flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {branches.length > 6 && (
            <div className="border-b border-border p-1.5">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter branches"
                className="h-8 text-xs"
                autoFocus
              />
            </div>
          )}
          <ul role="listbox" className="repo-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">No branches match.</li>
            ) : (
              filtered.map((branch) => {
                const selected = branch.name === value;
                return (
                  <li key={branch.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(branch.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={[
                        "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1 break-all">{branch.name}</span>
                      {branch.name === defaultBranch && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Default</span>
                      )}
                      {selected && <Check className="size-3.5 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}

export function DashboardClient({ user, repos, repoError: initialRepoError, linkedAccounts: initialLinkedAccounts }: DashboardClientProps) {
  // Account switcher
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>(initialLinkedAccounts);
  const [activeAccount, setActiveAccount] = useState<{ login: string; token: string } | null>(null);
  const [activeRepos, setActiveRepos] = useState<GitHubRepo[]>(repos);
  const [repoError, setRepoError] = useState<string | null>(initialRepoError);
  const [repoQuery, setRepoQuery] = useState("");
  const [reposLoading, setReposLoading] = useState(false);
  const restoredRef = useRef(false);
  const restoredFor = useRef<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);

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
      .then((result) => {
        setActiveRepos(result.repos);
        setRepoError(result.error);
      })
      .catch((err) => {
        setRepoError(err instanceof Error ? err.message : "Could not load repositories.");
      })
      .finally(() => setReposLoading(false));
  }

  // Multi-repo selection
  const [selectedRepos, setSelectedRepos] = useState<SelectedRepo[]>([]);
  const [activity, setActivity] = useState<GitHubActivity | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityPending, startActivityTransition] = useTransition();

  // Filters
  const [authorOnly, setAuthorOnly] = useState(true);
  const [hoursBack, setHoursBack] = useState(12);
  const [showingAllRepos, setShowingAllRepos] = useState(false);
  const [fetchedSelections, setFetchedSelections] = useState<RepoSelection[]>([]);
  const [selectedShas, setSelectedShas] = useState<Set<string>>(new Set());

  // Sanitization toggle
  // AI generation
  const [persona, setPersona] = useState<Persona>("mis");
  const [misCount, setMisCount] = useState<MessageCount>(1);
  const [standupState, setStandupState] = useState<StandupState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // PAT link form
  const [showPatForm, setShowPatForm] = useState(false);
  const [patValue, setPatValue] = useState("");
  const [patError, setPatError] = useState("");
  const [patPending, startPatTransition] = useTransition();

  const activeLogin = activeAccount?.login ?? user.login ?? "me";
  const activeToken = activeAccount?.token ?? undefined; // undefined = use session default

  useEffect(() => {
    if (reposLoading) return;
    if (restoredFor.current === activeLogin) return;
    if (activeRepos.length === 0 && !repoError) return;

    restoredFor.current = activeLogin;
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      setPrefsReady(true);
      return;
    }

    try {
      const prefs = JSON.parse(raw) as DashboardPrefs;
      if (prefs.login !== activeLogin) {
        setPrefsReady(true);
        return;
      }
      if (HOURS_OPTIONS.some((option) => option.value === prefs.hoursBack)) {
        setHoursBack(prefs.hoursBack);
      }
      setAuthorOnly(prefs.authorOnly);

      const known = new Map(activeRepos.map((repo) => [repo.fullName, repo]));
      const saved = prefs.repos.filter((repo) => known.has(repo.fullName)).slice(0, MAX_REPOS);
      if (saved.length === 0) {
        setPrefsReady(true);
        return;
      }

      setSelectedRepos(
        saved.map((repo) => ({
          fullName: repo.fullName,
          branch: repo.branch || known.get(repo.fullName)?.defaultBranch || "",
          branches: [],
          branchesLoading: true,
        }))
      );

      Promise.all(
        saved.map(async (repo) => {
          const branches = await fetchBranches(repo.fullName, activeToken).catch(() => []);
          const branch = branches.some((item) => item.name === repo.branch)
            ? repo.branch
            : known.get(repo.fullName)?.defaultBranch || branches[0]?.name || repo.branch;
          return {
            fullName: repo.fullName,
            branch,
            branches,
            branchesLoading: false,
          };
        })
      ).then((restored) => {
        setSelectedRepos(restored);
        setPrefsReady(true);
      });
    } catch {
      setPrefsReady(true);
    }
  }, [activeLogin, activeRepos, reposLoading, repoError, activeToken]);

  useEffect(() => {
    if (!prefsReady || restoredFor.current !== activeLogin) return;
    const payload: DashboardPrefs = {
      login: activeLogin,
      hoursBack,
      authorOnly,
      repos: selectedRepos
        .filter((repo) => repo.branch)
        .map((repo) => ({ fullName: repo.fullName, branch: repo.branch })),
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
  }, [prefsReady, selectedRepos, hoursBack, authorOnly, activeLogin]);

  async function switchToAccount(login: string) {
    setPrefsReady(false);
    restoredFor.current = null;
    if (login === user.login) {
      setActiveAccount(null);
      setActiveRepos(repos);
      setRepoError(initialRepoError);
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
      setPrefsReady(false);
      restoredFor.current = null;
      setActiveAccount(null);
      setActiveRepos(repos);
      setRepoError(initialRepoError);
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
      setShowingAllRepos(false);
      setFetchedSelections([]);
      setActivity(null);
      setSelectedShas(new Set());
      return;
    }
    setShowingAllRepos(false);
    setFetchedSelections([]);
    setActivityError(null);
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
      } catch (err) {
        setActivityError(err instanceof Error ? err.message : "Could not load commits.");
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

  function fetchAllCommits(hours = hoursBack, myOnly = authorOnly) {
    const branchByRepo = new Map(
      selectedRepos.filter((r) => r.branch).map((r) => [r.fullName, r.branch])
    );
    const selections: RepoSelection[] = activeRepos
      .map((r) => ({
        fullName: r.fullName,
        branch: branchByRepo.get(r.fullName) ?? r.defaultBranch,
      }))
      .filter((r) => r.branch);

    if (selections.length === 0) return;

    setActivityError(null);
    setFetchedSelections(selections);
    setShowingAllRepos(true);
    setActivity(null);
    setSelectedShas(new Set());
    startActivityTransition(async () => {
      try {
        const result = await previewActivity(
          selections,
          hours,
          myOnly,
          activeToken,
          activeToken ? activeLogin : undefined
        );
        setActivity(result);
        setSelectedShas(new Set(result.commits.map((c) => c.sha)));
      } catch (err) {
        setActivity(null);
        setActivityError(err instanceof Error ? err.message : "Could not load commits.");
      }
    });
  }

  function handleFetchAllCommits() {
    setStandupState({ status: "idle" });
    fetchAllCommits();
  }

  function handleHoursChange(val: string) {
    const hours = Number(val);
    setHoursBack(hours);
    setStandupState({ status: "idle" });
    if (showingAllRepos) fetchAllCommits(hours, authorOnly);
    else refreshPreview(selectedRepos, hours, authorOnly);
  }

  function handleAuthorOnlyChange(checked: boolean) {
    setAuthorOnly(checked);
    setStandupState({ status: "idle" });
    if (showingAllRepos) fetchAllCommits(hoursBack, checked);
    else refreshPreview(selectedRepos, hoursBack, checked);
  }

  function toggleSha(sha: string) {
    setSelectedShas((prev) => {
      const next = new Set(prev);
      next.has(sha) ? next.delete(sha) : next.add(sha);
      return next;
    });
  }

  function handleGenerate() {
    const loadedActivity =
      activity && (activity.commits.length > 0 || activity.pullRequests.length > 0)
        ? {
            ...activity,
            commits: activity.commits.map(({ diff: _diff, ...commit }) => commit),
          }
        : undefined;
    const searched =
      showingAllRepos && fetchedSelections.length > 0
        ? fetchedSelections
        : readyRepos.map((r) => ({ fullName: r.fullName, branch: r.branch }));
    const reposWithWork = new Set(
      [
        ...(loadedActivity?.commits.map((commit) => commit.repoName) ?? []),
        ...(loadedActivity?.pullRequests.map((pullRequest) => pullRequest.repoName) ?? []),
      ].map((name) => name.toLowerCase())
    );
    const selections = loadedActivity
      ? searched.filter((repo) => reposWithWork.has(repo.fullName.toLowerCase()))
      : searched;
    if (selections.length === 0 && !loadedActivity) return;
    setStandupState({ status: "loading" });
    startTransition(async () => {
      try {
        const result = await generateStandup(
          persona,
          selections,
          true,
          hoursBack,
          authorOnly,
          selectedShas.size > 0 ? [...selectedShas] : undefined,
          activeToken,
          activeToken ? activeLogin : undefined,
          loadedActivity,
          persona === "mis" ? misCount : 1
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

  function handleCopyMessage(index: number, message: string) {
    navigator.clipboard.writeText(message);
    setCopiedMessage(index);
    setTimeout(() => setCopiedMessage(null), 2000);
  }

  const isLoading = isPending || standupState.status === "loading";
  const readyRepos = selectedRepos.filter((r) => r.branch);
  const hasLoadedActivity =
    !!activity && (activity.commits.length > 0 || activity.pullRequests.length > 0);
  const canGenerate =
    (hasLoadedActivity ||
      (showingAllRepos ? fetchedSelections.length > 0 : readyRepos.length > 0)) &&
    !isLoading &&
    !activityPending;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const hoursLabel = HOURS_OPTIONS.find((o) => o.value === hoursBack)?.label ?? "Last 12h";
  const repoSearch = repoQuery.trim().toLowerCase();
  const visibleRepos = activeRepos.filter(
    (repo) =>
      !repoSearch ||
      repo.fullName.toLowerCase().includes(repoSearch) ||
      (repo.description ?? "").toLowerCase().includes(repoSearch) ||
      selectedRepos.some((selected) => selected.fullName === repo.fullName)
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full min-w-0 max-w-7xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            {/* Account switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                  {user.image && (
                    <Image
                      src={user.image}
                      alt={user.name ?? "User avatar"}
                      width={32}
                      height={32}
                      className="shrink-0 rounded-full ring-2 ring-primary/20"
                      priority
                    />
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold leading-none text-foreground">
                      {activeAccount?.login ?? user.name ?? "GitHub User"}
                    </p>
                    <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{today}</p>
                  </div>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
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
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full min-w-0 max-w-7xl space-y-3 overflow-x-clip px-3 py-3 sm:space-y-4 sm:px-6 sm:py-6 lg:px-8">

        {/* Nav links */}
        <div className="grid min-w-0 grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <Link href="/team" className="block min-w-0">
            <Button variant="outline" size="sm" className="w-full min-w-0 gap-1.5 overflow-hidden sm:w-auto sm:gap-2">
              <Users className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate text-xs sm:text-sm">Team</span>
            </Button>
          </Link>
          <Link href="/leaderboard" className="block min-w-0">
            <Button variant="outline" size="sm" className="w-full min-w-0 gap-1.5 overflow-hidden sm:w-auto sm:gap-2">
              <Trophy className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate text-xs sm:text-sm">Leaderboard</span>
            </Button>
          </Link>
          <Link href="/journal" className="block min-w-0">
            <Button variant="outline" size="sm" className="w-full min-w-0 gap-1.5 overflow-hidden sm:w-auto sm:gap-2">
              <BookOpen className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate text-xs sm:text-sm">Journal</span>
            </Button>
          </Link>
        </div>
        {activeAccount && (
          <Badge variant="secondary" className="max-w-full gap-1 text-xs">
            <Users className="size-3 shrink-0" />
            <span className="truncate">Viewing as {activeAccount.login}</span>
          </Badge>
        )}

        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        {/* Step 1 — Repo & Branch selection */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="min-w-0"
        >
          <Card className="min-w-0 gap-2 py-2.5 sm:gap-6 sm:py-6">
            <CardHeader className="gap-1 px-2.5 py-0 sm:gap-2 sm:p-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <BookOpen className="size-3.5 text-primary sm:size-4" />
                Select Repositories
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Choose up to {MAX_REPOS} repositories to track. Each gets its own branch selector.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 px-2.5 py-0 sm:space-y-3 sm:p-3">
              <Input
                value={repoQuery}
                onChange={(event) => setRepoQuery(event.target.value)}
                placeholder="Search owner/repo"
                className="h-8 text-sm"
              />
              {repoError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{repoError}</AlertDescription>
                </Alert>
              )}
              {/* Repo checklist */}
              <div className="repo-scroll max-h-72 space-y-2 overflow-x-hidden overflow-y-auto sm:max-h-96 lg:max-h-[min(42rem,calc(100vh-14rem))]">
                {reposLoading ? (
                  <div className="space-y-2">
                    {[1,2,3].map((n) => <Skeleton key={n} className="h-9 w-full" />)}
                  </div>
                ) : visibleRepos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No repositories match that search.</p>
                ) : visibleRepos.map((repo, i) => {
                  const isChecked = selectedRepos.some((r) => r.fullName === repo.fullName);
                  const isDisabled = !isChecked && selectedRepos.length >= MAX_REPOS;
                  const sel = selectedRepos.find((r) => r.fullName === repo.fullName);

                  return (
                    <motion.div
                      key={repo.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="min-w-0 overflow-hidden rounded-md border border-border/60 px-2.5 py-1.5 sm:px-3 sm:py-2"
                    >
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <Checkbox
                            id={`repo-${repo.id}`}
                            checked={isChecked}
                            disabled={isDisabled}
                            onCheckedChange={(checked) =>
                              handleRepoToggle(repo.fullName, !!checked)
                            }
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`repo-${repo.id}`}
                            className={[
                              "flex min-w-0 flex-1 cursor-pointer select-none flex-col gap-0.5",
                              isDisabled ? "text-muted-foreground" : "text-foreground",
                            ].join(" ")}
                          >
                            <span className="flex min-w-0 items-center gap-1.5 text-sm">
                              {repo.private && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                              <span className="truncate font-medium">{repo.fullName}</span>
                            </span>
                            <span className="hidden truncate text-xs text-muted-foreground lg:block">
                              {repo.description?.trim() || (repo.private ? "Private repository" : "Public repository")}
                              {" · "}
                              {formatUpdated(repo.updatedAt)}
                              {!isChecked ? ` · ${repo.defaultBranch}` : ""}
                            </span>
                          </label>
                        </div>

                        {isChecked && sel && (
                          <div className="min-w-0 sm:w-56 sm:shrink-0 lg:w-64">
                            <BranchPicker
                              branches={sel.branches}
                              value={sel.branch}
                              loading={sel.branchesLoading}
                              defaultBranch={repo.defaultBranch}
                              onChange={(branch) => handleBranchChange(repo.fullName, branch)}
                            />
                          </div>
                        )}
                      </div>
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
                <div className="w-full min-w-0 sm:w-32">
                <Select value={String(hoursBack)} onValueChange={handleHoursChange}>
                  <SelectTrigger className="h-8 w-full min-w-0 max-w-full text-xs">
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full gap-1.5 text-xs sm:w-auto"
                  disabled={activityPending || reposLoading || activeRepos.length === 0}
                  onClick={handleFetchAllCommits}
                >
                  <RefreshCw className={activityPending && showingAllRepos ? "size-3.5 animate-spin" : "size-3.5"} />
                  Fetch commits
                </Button>
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

        <div className="min-w-0 space-y-4 overflow-x-clip">
        {/* Activity Preview */}
        <AnimatePresence>
          {(activityPending || activity !== null) && (
            <motion.div
              key="activity-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="min-w-0"
            >
              <Card className="min-w-0 gap-2 py-2.5 sm:gap-6 sm:py-6">
                <CardHeader className="grid-rows-1 gap-0 px-2.5 py-0 sm:p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <CardTitle className="text-base">Activity Preview</CardTitle>
                    {!activityPending && activity && (
                      <CardDescription className="sm:text-right">
                        {showingAllRepos
                          ? "All repositories"
                          : readyRepos.map((r) => r.fullName.split("/")[1]).join(", ")}
                        {" · "}
                        {hoursLabel}
                        {" · "}
                        {authorOnly ? "My commits" : "All authors"}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-2.5 py-0 sm:p-3">
                  {(activityError || (activity?.warnings && activity.warnings.length > 0)) && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertCircle className="size-4" />
                      <AlertDescription>
                        {activityError ?? activity?.warnings?.join(" ")}
                      </AlertDescription>
                    </Alert>
                  )}
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
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Commits ({activity.commits.length})
                          </span>
                          {activity.commits.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              · {selectedShas.size} selected
                            </span>
                          )}
                        </div>
                        {activity.commits.length > 0 ? (
                          <ul className="repo-scroll max-h-[28rem] min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:max-h-[min(36rem,calc(100vh-16rem))] lg:space-y-1">
                            <li className="hidden grid-cols-[1rem_7.5rem_11rem_4.5rem_minmax(0,1fr)] gap-3 px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
                              <span />
                              <span>When</span>
                              <span>Repository</span>
                              <span>SHA</span>
                              <span>Message</span>
                            </li>
                            {activity.commits.map((c, i) => (
                              <motion.li
                                key={`${c.repoName}-${c.sha}-${i}`}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.02 }}
                                className="flex items-start gap-2 lg:grid lg:grid-cols-[1rem_7.5rem_11rem_4.5rem_minmax(0,1fr)] lg:items-center lg:gap-3 lg:rounded-md lg:px-1 lg:py-1.5 lg:hover:bg-muted/60"
                              >
                                <Checkbox
                                  checked={selectedShas.has(c.sha)}
                                  onCheckedChange={() => toggleSha(c.sha)}
                                  className="mt-0.5 shrink-0 lg:mt-0"
                                />
                                <span className="hidden text-xs tabular-nums text-muted-foreground lg:block">
                                  {formatWhen(c.timestamp)}
                                </span>
                                <span className="hidden truncate text-xs text-muted-foreground lg:block" title={c.repoName}>
                                  {c.repoName}
                                </span>
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hidden font-mono text-xs text-foreground underline-offset-2 hover:underline lg:inline"
                                >
                                  {c.sha}
                                </a>
                                <div className="flex min-w-0 flex-1 flex-col items-start gap-1 md:flex-row lg:contents">
                                  <div className="flex flex-wrap items-center gap-1 lg:hidden">
                                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                                      {c.sha}
                                    </Badge>
                                    <Badge variant="secondary" className="max-w-full shrink text-xs whitespace-normal">
                                      {c.repoName.split("/")[1] ?? c.repoName}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{formatWhen(c.timestamp)}</span>
                                  </div>
                                  <span className="min-w-0 flex-1 break-words text-sm text-foreground lg:truncate">
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
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                                <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                                  {pr.title}
                                </span>
                                <span className="hidden text-xs tabular-nums text-muted-foreground lg:inline">
                                  {formatWhen(pr.createdAt)}
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
          className="min-w-0"
        >
          <Card className="min-w-0 gap-2 py-2.5 sm:gap-6 sm:py-6">
            <CardHeader className="grid-rows-1 gap-0 px-2.5 py-0 sm:grid-rows-[auto_auto] sm:gap-2 sm:p-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Sparkles className="size-3.5 text-primary sm:size-4" />
                Generate Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-2.5 py-0 sm:space-y-4 sm:p-3">
              {/* Persona toggle */}
              <div className="space-y-1.5 sm:space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Summary Style
                </p>
                <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                  <Button
                    variant={persona === "manager" ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs sm:h-8 sm:gap-2 sm:px-3 sm:text-sm"
                    onClick={() => setPersona("manager")}
                    disabled={isLoading}
                  >
                    <Briefcase className="size-3 sm:size-3.5" />
                    Manager
                  </Button>
                  <Button
                    variant={persona === "peer" ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs sm:h-8 sm:gap-2 sm:px-3 sm:text-sm"
                    onClick={() => setPersona("peer")}
                    disabled={isLoading}
                  >
                    <Code2 className="size-3 sm:size-3.5" />
                    Peer
                  </Button>
                  <Button
                    variant={persona === "mis" ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs sm:h-8 sm:gap-2 sm:px-3 sm:text-sm"
                    onClick={() => setPersona("mis")}
                    disabled={isLoading}
                  >
                    <MessageCircle className="size-3 sm:size-3.5" />
                    MIS
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {persona === "manager"
                    ? "Business impact for managers and stakeholders."
                    : persona === "mis"
                      ? "Separate updates. Each one covers different work."
                      : "Technical detail for engineers and team leads."}
                </p>
                {persona === "mis" && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">How many updates</p>
                    <div className="flex gap-1">
                      {([1, 2, 3] as MessageCount[]).map((count) => (
                        <Button
                          key={count}
                          type="button"
                          size="sm"
                          variant={misCount === count ? "default" : "outline"}
                          className="size-7 px-0 text-xs"
                          disabled={isLoading}
                          onClick={() => setMisCount(count)}
                          aria-label={`${count} ${count === 1 ? "message" : "messages"}`}
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Always-on privacy indicator */}
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 sm:px-3 sm:py-2">
                  <Shield className="size-3.5 shrink-0 text-foreground" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Privacy on.</span>
                    {" "}IPs, emails, and secrets are masked before the summary is written.
                  </p>
                </div>

              <Button
                className="h-9 w-full gap-2 text-sm sm:h-10"
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
                        {personaLabel(standupState.result.persona)}
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
                <CardContent className="px-3 pt-4 md:px-6">
                  {standupState.result.persona === "mis" && (standupState.result.messages?.length ?? 0) > 0 ? (
                    <div className="space-y-3">
                      {standupState.result.messages!.map((message, index) => (
                        <div key={index} className="rounded-md border border-border/70 px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Message {index + 1}
                            </p>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-8"
                              title={`Copy message ${index + 1}`}
                              onClick={() => handleCopyMessage(index, message)}
                            >
                              {copiedMessage === index ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                            </Button>
                          </div>
                          <p className="text-sm leading-relaxed text-foreground">{message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="min-w-0 break-words [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-muted-foreground [&_pre]:overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {standupState.result.markdown}
                      </ReactMarkdown>
                    </div>
                  )}
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
          {standupState.status === "success" && !isLoading && standupState.result.persona !== "mis" && standupState.result.whatsappMessage && (
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
        </div>
        </div>

      </main>
    </div>
  );
}
