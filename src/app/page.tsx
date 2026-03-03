import { getServerSession } from "next-auth/next";
import { NextauthOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(NextauthOptions);
  redirect(session ? "/dashboard" : "/login");
}
