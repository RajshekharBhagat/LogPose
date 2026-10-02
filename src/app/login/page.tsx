"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="items-center pb-2 text-center">
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-foreground text-background">
                <Github className="size-4" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Log Pose
              </span>
            </div>

            <CardTitle className="text-base font-medium">Sign in</CardTitle>
            <CardDescription className="text-sm">
              Read your GitHub commits and draft a standup.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-2">
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            >
              <Github className="size-4" />
              Continue with GitHub
            </Button>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              GitHub OAuth only. Log Pose stores no password. You can revoke access from GitHub settings at any time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
