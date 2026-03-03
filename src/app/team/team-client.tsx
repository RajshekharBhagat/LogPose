"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { createTeam, joinTeam } from "@/lib/actions/team-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Trophy, Users, Link2, AlertCircle, Check, Copy } from "lucide-react";
import type { TeamLog } from "@/types/team";

interface TeamInfo {
  team_id: string;
  name: string;
  invite_code: string;
}

interface TeamClientProps {
  userId: string;
  team: TeamInfo | null;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
      : score >= 50
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score}/100
    </span>
  );
}

function TeamForm({ onSuccess }: { onSuccess: () => void }) {
  const router = useRouter();
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPendingCreate, startCreate] = useTransition();
  const [isPendingJoin, startJoin] = useTransition();

  function handleCreate() {
    if (!createName.trim()) return;
    setCreateError("");
    startCreate(async () => {
      try {
        const { invite_code } = await createTeam(createName.trim());
        setNewInviteCode(invite_code);
        setTimeout(() => {
          onSuccess();
          router.refresh();
        }, 2000);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Failed to create team.");
      }
    });
  }

  function handleJoin() {
    if (joinCode.trim().length < 6) return;
    setJoinError("");
    startJoin(async () => {
      try {
        await joinTeam(joinCode.trim());
        onSuccess();
        router.refresh();
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : "Failed to join team.");
      }
    });
  }

  function copyCode() {
    if (!newInviteCode) return;
    navigator.clipboard.writeText(newInviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Create Team */}
      <Card className="p-2 md:p-3">
        <CardHeader className="p-2 md:p-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-3.5 text-primary" />
            Create a Team
          </CardTitle>
          <CardDescription className="text-xs">
            Start a new team and share the invite code with your colleagues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-2 md:p-3">
          {newInviteCode ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
                <Check className="size-3.5" />
                Team created!
              </div>
              <p className="text-xs text-muted-foreground">Share this invite code:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-muted px-3 py-1.5 text-center font-mono text-base font-bold tracking-widest text-foreground">
                  {newInviteCode}
                </div>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={copyCode}>
                  {copiedCode ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </motion.div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="team-name" className="text-xs">Team name</Label>
                <Input
                  id="team-name"
                  placeholder="e.g. Platform Team"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  disabled={isPendingCreate}
                  className="h-8 text-sm"
                />
              </div>
              {createError && (
                <Alert variant="destructive" className="py-1.5">
                  <AlertCircle className="size-3.5" />
                  <AlertDescription className="text-xs">{createError}</AlertDescription>
                </Alert>
              )}
              <Button
                className="w-full"
                size="sm"
                onClick={handleCreate}
                disabled={isPendingCreate || !createName.trim()}
              >
                {isPendingCreate ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : "Create Team"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Join Team */}
      <Card className="p-2 md:p-3">
        <CardHeader className="p-2 md:p-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Link2 className="size-3.5 text-primary" />
            Join a Team
          </CardTitle>
          <CardDescription className="text-xs">
            Enter the 6-character invite code from your team lead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-2 md:p-3">
          <div className="space-y-1">
            <Label htmlFor="invite-code" className="text-xs">Invite code</Label>
            <Input
              id="invite-code"
              placeholder="e.g. XJ7K2P"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              disabled={isPendingJoin}
              maxLength={6}
              className="h-8 text-sm font-mono tracking-widest uppercase"
            />
          </div>
          {joinError && (
            <Alert variant="destructive" className="py-1.5">
              <AlertCircle className="size-3.5" />
              <AlertDescription className="text-xs">{joinError}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={handleJoin}
            disabled={isPendingJoin || joinCode.length < 6}
          >
            {isPendingJoin ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            ) : "Join Team"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TeamClient({ userId, team }: TeamClientProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<TeamLog[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!team) return;
    const es = new EventSource("/api/feed/stream");
    es.onmessage = (e) => {
      const data: TeamLog[] = JSON.parse(e.data);
      setLogs(data);
    };
    return () => es.close();
  }, [team]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const personaLabel = (p: string) =>
    p === "manager" ? "Manager" : p === "client" ? "Client" : "Peer";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {team ? team.name : "Team"}
              </p>
              {team && (
                <p className="text-xs text-muted-foreground font-mono">
                  Invite: {team.invite_code}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {team && (
              <Link href="/leaderboard">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Trophy className="size-3.5" />
                  <span className="hidden md:inline">Leaderboard</span>
                </Button>
              </Link>
            )}
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="size-3.5" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {/* No team — show create/join form prominently */}
        {!team && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-4 text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                You are not part of a team yet
              </p>
              <p className="text-xs text-muted-foreground">
                Create a new team or join one with an invite code.
              </p>
            </div>
            <TeamForm onSuccess={() => router.refresh()} />
          </motion.div>
        )}

        {/* Has team — show today's feed */}
        {team && (
          <>
            {logs.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <Users className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-foreground">No updates today yet</p>
                    <p className="text-xs text-muted-foreground">
                      Generate a standup on the dashboard and save it to appear here.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <AnimatePresence mode="popLayout">
              {logs.map((log, i) => {
                const isMe = log.userId === userId;
                const isExpanded = expanded.has(log.id);
                const time = new Date(log.generatedAt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                  >
                    <Card className={isMe ? "ring-1 ring-primary/30 p-2 md:p-3" : ""}>
                      <CardHeader className="p-2 md:p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {log.author.avatar_url ? (
                              <Image
                                src={log.author.avatar_url}
                                alt={log.author.name}
                                width={32}
                                height={32}
                                className="rounded-full"
                              />
                            ) : (
                              <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {log.author.name[0]?.toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {log.author.name}
                                {isMe && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{time}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <Badge variant="secondary" className="text-xs">
                              {personaLabel(log.persona)}
                            </Badge>
                            {log.quality_score && (
                              <ScoreBadge score={log.quality_score.total_score} />
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <Separator />
                      <CardContent className="space-y-3 p-2 md:p-3">
                        <div
                          className={[
                            "overflow-hidden transition-all duration-300",
                            isExpanded ? "" : "max-h-32",
                            "[&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-muted-foreground [&_p]:mb-2 [&_p]:text-sm [&_p]:text-muted-foreground [&_ul]:mb-2 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground",
                          ].join(" ")}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {log.markdown}
                          </ReactMarkdown>
                        </div>
                        <button
                          onClick={() => toggleExpanded(log.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>

                        {log.quality_score && (
                          <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                            {log.quality_score.critical_feedback}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Create / Join section — always visible below the feed */}
            <div className="pt-2">
              <Separator className="mb-4" />
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                Create or Switch Team
              </p>
              <TeamForm onSuccess={() => router.refresh()} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
