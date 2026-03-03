import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import { getJournal } from "@/lib/actions/get-journal";
import { JournalClient } from "./journal-client";

export default async function JournalPage() {
  const session = await getServerSession(NextauthOptions);

  if (!session) {
    redirect("/login");
  }

  const entries = await getJournal().catch(() => []);

  return (
    <JournalClient
      entries={entries}
      user={{
        name: session.user?.name ?? null,
        image: session.user?.image ?? null,
      }}
    />
  );
}
