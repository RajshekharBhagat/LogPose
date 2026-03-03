import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getLeaderboard, getMyTeam } from "@/lib/actions/team-actions";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Flame, Trophy, Users } from "lucide-react";

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color =
    score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
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
      <header className="border-b border-border/60 bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Leaderboard — {team.name}</p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-2 md:p-3">
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
                    className="flex items-center gap-3 rounded-md border border-border/60 p-2"
                  >
                    <div className="flex items-center gap-3">
                      <Trophy className="size-4 text-primary" />
                      <span className="text-xs font-medium tabular-nums">{i + 1}</span>
                    </div>


                    {/* Avatar */}
                    {entry.avatar_url ? (
                      <Image
                        src={entry.avatar_url}
                        alt={entry.name}
                        width={32}
                        height={32}
                        className="rounded-full shrink-0"
                      />
                    ) : (
                      <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {entry.name[0]?.toUpperCase()}
                      </div>
                    )}

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {entry.name}
                        {entry.userId === session.githubLogin && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.total_logs} log{entry.total_logs !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Score bar */}
                    <ScoreBar score={entry.avg_score} />

                    {/* Streak */}
                    {entry.streak > 0 && (
                      <div className="flex items-center gap-0.5 text-xs font-medium text-orange-500">
                        <Flame className="size-3.5" />
                        {entry.streak}d
                      </div>
                    )}
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
