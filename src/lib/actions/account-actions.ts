"use server";

import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { getDb } from "@/lib/db";

export interface LinkedAccount {
  github_login: string;
}

export async function getLinkedAccounts(): Promise<LinkedAccount[]> {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) return [];

  const db = await getDb();
  const docs = await db
    .collection("linked_accounts")
    .find({ primary_user_id: session.githubLogin }, { projection: { github_login: 1, _id: 0 } })
    .toArray();

  return docs.map((d) => ({ github_login: d.github_login as string }));
}

export async function removeLinkedAccount(githubLogin: string): Promise<void> {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) throw new Error("Not authenticated.");

  const db = await getDb();
  await db.collection("linked_accounts").deleteOne({
    primary_user_id: session.githubLogin,
    github_login: githubLogin,
  });
}

export async function linkAccountWithPAT(pat: string): Promise<{ github_login: string }> {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) throw new Error("Not authenticated.");

  // Validate the PAT by hitting the GitHub API
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Invalid token. Make sure the PAT has 'repo' and 'read:user' scopes.");

  const data = (await res.json()) as { login: string };
  const linkedLogin = data.login;

  if (linkedLogin === session.githubLogin) {
    throw new Error("That is already your primary account.");
  }

  const db = await getDb();
  await db.collection("linked_accounts").updateOne(
    { primary_user_id: session.githubLogin, github_login: linkedLogin },
    { $set: { access_token: pat, updated_at: new Date() } },
    { upsert: true }
  );

  return { github_login: linkedLogin };
}

export async function getLinkedAccountToken(githubLogin: string): Promise<string> {
  const session = await getServerSession(NextauthOptions);
  if (!session?.githubLogin) throw new Error("Not authenticated.");

  const db = await getDb();
  const doc = await db.collection("linked_accounts").findOne({
    primary_user_id: session.githubLogin,
    github_login: githubLogin,
  });

  if (!doc?.access_token) throw new Error("Linked account not found.");
  return doc.access_token as string;
}
