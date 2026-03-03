import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = await getDb();
  const profile = await db
    .collection("profiles")
    .findOne({ userId: session.githubLogin });

  if (!profile?.team_id) {
    return new Response("No team", { status: 403 });
  }

  const teamId = profile.team_id as string;

  async function buildFeed() {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch today's journal entries for the team
    const logs = await db
      .collection("journal")
      .find({ team_id: teamId, date: today }, { projection: { userId: 1, date: 1, markdown: 1, persona: 1, generatedAt: 1, commitCount: 1, prCount: 1, quality_score: 1, _id: 1 } })
      .sort({ generatedAt: -1 })
      .toArray();

    // Fetch profiles for all authors
    const authorIds = [...new Set(logs.map((l) => l.userId as string))];
    const profiles = await db
      .collection("profiles")
      .find({ userId: { $in: authorIds } }, { projection: { userId: 1, name: 1, avatar_url: 1, _id: 0 } })
      .toArray();
    const profileMap = new Map(profiles.map((p) => [p.userId as string, p]));

    return logs.map((log) => {
      const author = profileMap.get(log.userId as string);
      return {
        id: log._id.toString(),
        userId: log.userId,
        date: log.date,
        markdown: log.markdown,
        persona: log.persona,
        generatedAt: log.generatedAt,
        commitCount: log.commitCount,
        prCount: log.prCount,
        quality_score: log.quality_score ?? null,
        author: {
          name: (author?.name as string) ?? (log.userId as string),
          avatar_url: (author?.avatar_url as string) ?? "",
        },
      };
    });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data immediately
      try {
        const data = await buildFeed();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        // continue even if initial fetch fails
      }

      // Poll every 5 seconds
      intervalId = setInterval(async () => {
        try {
          const data = await buildFeed();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore transient errors
        }
      }, 5000);

      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        controller.close();
      });
    },
    cancel() {
      clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
