import { env } from "@/lib/env";
import { NextAuthOptions } from "next-auth";
import Github from "next-auth/providers/github";

export const NextauthOptions:NextAuthOptions = {
    secret: env.NEXTAUTH_SECRET,
    providers: [
        Github({
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: 'read:user user:email repo',
                }
            }
        })
    ],
    callbacks: {
        async jwt({token, account, profile}) {
            if(account?.provider === 'github') {
                token.githubAccessToken = account.access_token;
                token.githubLogin = (profile as { login?: string })?.login;
            }
            return token;
        },
        async session({session, token}) {
            session.githubAccessToken = token.githubAccessToken as string;
            session.githubLogin = token.githubLogin as string;
            return session;
        }
    }
}