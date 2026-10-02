import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getLeaderboard, getMyTeam } from "@/lib/actions/team-actions";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Flame, Trophy, Users } from "lucide-react";

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color =
    score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex w-full items-center gap-3 sm:w-auto">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:w-28 sm:flex-none">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums">{score}</span>
    </div>
  );
}

export default async function LeaderboardPage() {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) redirect("/login");

  const team = await getMyTeam();
  if (!team) redirect("/onboard");

  const entries = await getLeaderboard();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="size-4 shrink-0 text-primary" />
            <p className="truncate text-sm font-semibold text-foreground">Leaderboard — {team.name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/team">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Users className="size-3.5" />
                <span className="hidden md:inline">Team Feed</span>
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="size-3.5" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <Card className="p-2 md:p-3">
          <CardHeader className="p-2 md:p-3">
            <CardTitle className="text-base">Quality Rankings</CardTitle>
            <CardDescription>Based on AI code quality scores over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="p-2 md:p-3">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No scored entries yet. Generate and save standups to appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {entries.map((entry, i) => (
                  <div
                    key={entry.userId}
                    className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-5 text-xs font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                      {entry.avatar_url ? (
                        <Image
                          src={entry.avatar_url}
                          alt={entry.name}
                          width={32}
                          height={32}
                          className="shrink-0 rounded-full"
                        />
                      ) : (
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                          {entry.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {entry.name}
                          {entry.userId === session.githubLogin && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.total_logs} log{entry.total_logs !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <ScoreBar score={entry.avg_score} />
                      {entry.streak > 0 && (
                        <div className="flex items-center gap-0.5 text-xs font-medium text-orange-500">
                          <Flame className="size-3.5" />
                          {entry.streak}d
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
