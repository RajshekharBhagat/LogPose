import NextAuth from "next-auth";
import { NextauthOptions } from "./options";

const handler = NextAuth(NextauthOptions);

export { handler as GET, handler as POST };