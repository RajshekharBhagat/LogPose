import { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    githubAccessToken?: string;
    githubLogin?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string;
    githubLogin?: string;
  }
}