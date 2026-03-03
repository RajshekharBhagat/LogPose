"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { JournalEntry } from "@/lib/actions/get-journal";

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

  const entryMap = new Map(entries.map((e) => [e.date, e]));

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

  const selectedEntry = selectedDate ? entryMap.get(selectedDate) : null;

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
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Journal</p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="size-3.5" />
              Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
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
                {entries.length} standup{entries.length !== 1 ? "s" : ""} saved in the last 90 days
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
                      onClick={() => hasEntry ? setSelectedDate(isSelected ? null : key) : undefined}
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
                    </motion.button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{selectedDate}</CardTitle>
                      <Badge variant="secondary">
                        {selectedEntry.persona === "manager" ? "Manager Mode" : "Peer Mode"}
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
