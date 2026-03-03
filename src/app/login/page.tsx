"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Card className="border-border/60 shadow-xl">
          <CardHeader className="items-center pb-2 text-center">
            {/* Brand lockup */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Github className="size-5" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                Log Pose
              </span>
            </div>

            <CardTitle className="text-xl font-semibold">
              Welcome back
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Sign in to explore your GitHub commits
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-6">
            <Button
              size="lg"
              className="w-full gap-2 font-medium"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            >
              <Github className="size-4" />
              Continue with GitHub
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By continuing, you grant read access to your GitHub repositories
              and commit history.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          Log Pose uses GitHub OAuth. No passwords stored.
        </p>
      </div>
    </div>
  );
}
