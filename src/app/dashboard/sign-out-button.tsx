"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <Button
      variant="outline"
      className=" gap-2 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4" />
      <p className="hidden md:block">Sign out</p>
    </Button>
  );
}
