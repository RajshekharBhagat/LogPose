"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createTeam, joinTeam } from "@/lib/actions/team-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Link2, AlertCircle, Check } from "lucide-react";

export function OnboardClient() {
  const router = useRouter();
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isPendingCreate, startCreate] = useTransition();
  const [isPendingJoin, startJoin] = useTransition();

  function handleCreate() {
    if (!createName.trim()) return;
    setCreateError("");
    startCreate(async () => {
      try {
        const { invite_code } = await createTeam(createName.trim());
        setInviteCode(invite_code);
        setTimeout(() => router.push("/team"), 2500);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Failed to create team.");
      }
    });
  }

  function handleJoin() {
    if (!joinCode.trim()) return;
    setJoinError("");
    startJoin(async () => {
      try {
        await joinTeam(joinCode.trim());
        router.push("/team");
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : "Failed to join team.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center space-y-1"
        >
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to LogPose</h1>
          <p className="text-sm text-muted-foreground">
            Create a new team or join an existing one to get started.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Create Team */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-primary" />
                  Create a Team
                </CardTitle>
                <CardDescription>Start a new team and invite your colleagues.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {inviteCode ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-medium">
                      <Check className="size-4" />
                      Team created!
                    </div>
                    <p className="text-xs text-muted-foreground">Share this invite code with your team:</p>
                    <div className="rounded-md bg-muted px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-foreground">
                      {inviteCode}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Redirecting to team feed…</p>
                  </motion.div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="team-name" className="text-xs">Team name</Label>
                      <Input
                        id="team-name"
                        placeholder="e.g. Platform Team"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        disabled={isPendingCreate}
                        className="h-9 text-sm"
                      />
                    </div>
                    {createError && (
                      <Alert variant="destructive" className="py-2">
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
                        <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                      ) : (
                        "Create Team"
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Join Team */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="size-4 text-primary" />
                  Join a Team
                </CardTitle>
                <CardDescription>Enter the 6-character invite code from your team lead.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-code" className="text-xs">Invite code</Label>
                  <Input
                    id="invite-code"
                    placeholder="e.g. XJ7K2P"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    disabled={isPendingJoin}
                    maxLength={6}
                    className="h-9 text-sm font-mono tracking-widest uppercase"
                  />
                </div>
                {joinError && (
                  <Alert variant="destructive" className="py-2">
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
                    <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                  ) : (
                    "Join Team"
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
