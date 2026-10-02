"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, BookOpen, ArrowLeft, Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { generateWeeklyRollup } from "@/lib/actions/weekly-rollup";
import type { JournalEntry } from "@/lib/actions/get-journal";
import { personaLabel, type MessageCount, type Persona, type StandupResult } from "@/types/standup";

interface JournalClientProps {
  entries: JournalEntry[];
  user: { name: string | null; image: string | null };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function JournalClient({ entries, user }: JournalClientProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const [weekPersona, setWeekPersona] = useState<Persona>("manager");
  const [weekMisCount, setWeekMisCount] = useState<MessageCount>(1);
  const [weekResult, setWeekResult] = useState<StandupResult | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [weekCopied, setWeekCopied] = useState(false);
  const [weekPending, startWeekTransition] = useTransition();

  function handleWeeklyRollup() {
    setWeekError(null);
    setWeekResult(null);
    startWeekTransition(async () => {
      try {
        const result = await generateWeeklyRollup(
          weekPersona,
          weekPersona === "mis" ? weekMisCount : 1
        );
        setWeekResult(result);
      } catch (err) {
        setWeekError(err instanceof Error ? err.message : "Could not build the weekly summary.");
      }
    });
  }

  const entryMap = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const arr = entryMap.get(e.date) ?? [];
    arr.push(e);
    entryMap.set(e.date, arr);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function dateKey(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedEntries = selectedDate ? (entryMap.get(selectedDate) ?? null) : null;
  const selectedEntry = selectedEntries ? selectedEntries[selectedEntryIdx] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Journal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="size-3.5" />
                <p className="hidden md:block">Dashboard</p>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>
              Combine the last 7 days of journal entries into one update.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["manager", "peer", "mis"] as Persona[]).map((persona) => (
                <Button
                  key={persona}
                  size="sm"
                  variant={weekPersona === persona ? "default" : "outline"}
                  onClick={() => setWeekPersona(persona)}
                  disabled={weekPending}
                >
                  {personaLabel(persona)}
                </Button>
              ))}
              {weekPersona === "mis" &&
                ([1, 2, 3] as MessageCount[]).map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant={weekMisCount === count ? "default" : "outline"}
                    disabled={weekPending}
                    onClick={() => setWeekMisCount(count)}
                  >
                    {count} {count === 1 ? "message" : "messages"}
                  </Button>
                ))}
              <Button size="sm" onClick={handleWeeklyRollup} disabled={weekPending}>
                {weekPending ? "Summarizing…" : "Summarize this week"}
              </Button>
            </div>
            {weekError && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{weekError}</AlertDescription>
              </Alert>
            )}
            {weekResult && (
              <div className="space-y-3">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{weekResult.markdown}</ReactMarkdown>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(weekResult.markdown);
                    setWeekCopied(true);
                    setTimeout(() => setWeekCopied(false), 2000);
                  }}
                >
                  {weekCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {weekCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,28rem)_minmax(0,1fr)] xl:grid-cols-[minmax(22rem,32rem)_minmax(0,1fr)]">
        {/* Calendar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {MONTHS[viewMonth]} {viewYear}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="size-8" onClick={prevMonth}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-8" onClick={nextMonth}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
              <CardDescription>
                {entries.length} {entries.length !== 1 ? "entries" : "entry"} saved in the last 90 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="mb-2 grid grid-cols-7 text-center">
                {DAYS.map((d) => (
                  <p key={d} className="text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </p>
                ))}
              </div>
              {/* Date cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} />;
                  const key = dateKey(day);
                  const hasEntry = entryMap.has(key);
                  const isSelected = selectedDate === key;
                  const isToday =
                    key === today.toISOString().slice(0, 10);

                  return (
                    <motion.button
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.008 }}
                      onClick={() => {
                        if (!hasEntry) return;
                        if (isSelected) {
                          setSelectedDate(null);
                        } else {
                          setSelectedDate(key);
                          setSelectedEntryIdx(0);
                        }
                      }}
                      disabled={!hasEntry}
                      className={[
                        "relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors",
                        hasEntry
                          ? isSelected
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-primary/10 text-primary font-medium hover:bg-primary/20 cursor-pointer"
                          : "text-muted-foreground cursor-default",
                        isToday && !isSelected && !hasEntry
                          ? "ring-1 ring-border font-medium text-foreground"
                          : "",
                        isToday && hasEntry && !isSelected
                          ? "ring-1 ring-primary"
                          : "",
                      ].join(" ")}
                    >
                      {day}
                      {hasEntry && (entryMap.get(key)?.length ?? 0) > 1 && (
                        <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                          {entryMap.get(key)!.length}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="min-w-0">
        {/* Selected entry */}
        <AnimatePresence mode="wait">
          {selectedEntry && (
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{selectedDate}</CardTitle>
                      <Badge variant="secondary">
                        {personaLabel(selectedEntry.persona)}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {selectedEntry.commitCount} commits · {selectedEntry.prCount} PRs
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selectedEntry.repos.map((repo) => (
                      <Badge key={repo} variant="outline" className="text-xs font-mono">
                        {repo.split("/")[1] ?? repo}
                      </Badge>
                    ))}
                  </div>
                  {selectedEntries && selectedEntries.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {selectedEntries.map((e, i) => {
                        const time = new Date(e.generatedAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const modeLabel = personaLabel(e.persona);
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedEntryIdx(i)}
                            className={[
                              "rounded-md border px-2 py-0.5 text-xs transition-colors",
                              i === selectedEntryIdx
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                            ].join(" ")}
                          >
                            #{i + 1} · {time} · {modeLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedEntry.quality_score && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={[
                            "text-sm font-semibold",
                            selectedEntry.quality_score.total_score >= 75
                              ? "text-green-600 dark:text-green-400"
                              : selectedEntry.quality_score.total_score >= 50
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-red-600 dark:text-red-400",
                          ].join(" ")}
                        >
                          Quality: {selectedEntry.quality_score.total_score}/100
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Func: {selectedEntry.quality_score.breakdown.functionality}/40
                          {" · "}Practices: {selectedEntry.quality_score.breakdown.quality}/40
                          {" · "}Scale: {selectedEntry.quality_score.breakdown.scalability}/20
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {selectedEntry.quality_score.critical_feedback}
                      </p>
                    </div>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <div className="[&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border [&_p]:mb-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:text-sm [&_li]:text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedEntry.markdown}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        {!selectedEntry && entries.length > 0 && (
          <Card className="hidden lg:block">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Select a highlighted day to read that entry.
            </CardContent>
          </Card>
        )}
        </div>
        </div>

        {/* Empty state */}
        {entries.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <BookOpen className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">No journal entries yet</p>
                <p className="text-xs text-muted-foreground">
                  Generate a standup on the dashboard and hit &quot;Save to Journal&quot; to start your history.
                </p>
                <Link href="/dashboard">
                  <Button size="sm" className="mt-2">Go to Dashboard</Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
}
