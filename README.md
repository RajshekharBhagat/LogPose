# Log Pose AI

**AI-Powered Workflow Synchronization for Developers.**

Log Pose AI eliminates the daily overhead of writing standup reports. It connects to your GitHub account, fetches your last 24 hours of commits and pull requests, and uses Google Gemini to synthesize a polished, professional summary — in seconds.

---

## Features

- **GitHub Activity Ingestion** — Pulls push events and pull requests from the GitHub REST API using your OAuth token (no manual input required)
- **AI-Powered Synthesis** — Google Gemini categorizes your work into *Features*, *Fixes*, and *Maintenance* with context-aware summaries
- **Dual Persona Modes**
  - **Manager Mode** — Plain-language business impact for product managers and stakeholders
  - **Peer Mode** — Technical detail for engineers and team leads
- **One-Click Copy** — Copy the generated markdown to your clipboard for Slack, Teams, or Jira
- **Secure OAuth Flow** — GitHub access token stored in a signed JWT; never exposed to the client

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Authentication | NextAuth.js v4 (GitHub OAuth2) |
| AI Engine | Google Gemini (`@google/generative-ai`) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Language | TypeScript (strict mode) |
| Validation | Zod |

---

## Architecture

```
Browser
  └── /dashboard (Server Component)
        └── DashboardClient (Client Component)
              └── generateStandup() [Server Action]
                    ├── getServerSession()         → Validate GitHub token
                    ├── fetchGitHubActivity()      → GitHub REST API
                    │     ├── GET /users/{login}/events   (push events)
                    │     └── GET /search/issues          (pull requests)
                    └── synthesizeWithGemini()     → Google Gemini
                          └── Structured markdown output
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [GitHub OAuth App](https://github.com/settings/developers) (set callback URL to `http://localhost:3000/api/auth/callback/github`)
- A [Google AI Studio API key](https://aistudio.google.com/app/apikey) (free tier available)

### Installation

```bash
git clone https://github.com/your-username/log_pose.git
cd log_pose
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secret_32chars_minimum
GEMINI_API_KEY=your_google_ai_studio_api_key
```

Generate a `NEXTAUTH_SECRET` with:
```bash
openssl rand -base64 32
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

---

## Project Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/   # NextAuth route + config
│   ├── dashboard/
│   │   ├── page.tsx              # Server Component (auth gate)
│   │   ├── dashboard-client.tsx  # Client Component (UI + state)
│   │   └── sign-out-button.tsx
│   └── login/page.tsx
├── lib/
│   ├── actions/
│   │   └── generate-standup.ts  # Server Action (pipeline orchestrator)
│   ├── github.ts                # GitHub REST API client
│   ├── gemini.ts                # Gemini SDK + prompt engineering
│   └── env.ts                   # Zod env validation
└── types/
    ├── github.ts                # GitHub API response types
    ├── standup.ts               # Standup result + UI state types
    └── next-auth.d.ts           # NextAuth type augmentation
```

---

## Impact Metrics

| Metric | Before | After |
|--------|--------|-------|
| Daily standup prep time | ~10 minutes | ~30 seconds |
| Grammatical errors in reports | Variable | Zero |
| Context switching to check Git history | Required | Eliminated |

---

## License

MIT
