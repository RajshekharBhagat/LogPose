import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import type { GitHubActivity } from "@/types/github";
import type { Persona } from "@/types/standup";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const WA_START = "---WHATSAPP_START---";
const WA_END = "---WHATSAPP_END---";

function buildPrompt(activity: GitHubActivity, persona: Persona): string {
  const { username, commits, pullRequests } = activity;

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const commitLines =
    commits.length > 0
      ? commits
          .map((c) => `- [${c.repoName}] ${c.message} (${c.sha})`)
          .join("\n")
      : "No commits in the last 24 hours.";

  const prLines =
    pullRequests.length > 0
      ? pullRequests
          .map(
            (pr) =>
              `- [${pr.repoName}] PR #${pr.number}: "${pr.title}" (${pr.state})`
          )
          .join("\n")
      : "No pull requests in the last 24 hours.";

  const personaInstruction =
    persona === "manager"
      ? `You are writing for a NON-TECHNICAL MANAGER. Focus on business impact, features delivered, and blockers. Avoid jargon. Use plain language. Emphasize "what was accomplished" and "what it means for the product".`
      : persona === "client"
      ? `Act as a direct project communicator. Convert the commits into a bulleted list for a non-technical client.
Use simple, plain English. Focus only on the outcome (what changed), not the process.
NO emojis. NO introductory or concluding text (do not say "Here is your update").
NO technical jargon — no "UI", "repos", "branches", "refactor", "dependency", or "fix".
Each line must start with a past-tense action verb (e.g. "Added", "Updated", "Removed", "Improved").
Keep the entire list under 40 words. Output ONLY bullet lines — no headings, no sections, no markdown other than "- " bullets.`
      : `You are writing for a TECHNICAL PEER or TEAM LEAD. Include technical context, reference specific systems where inferable from commit messages, and be precise about what changed and why it matters architecturally.`;

  const mainFormat =
    persona === "client"
      ? `Output ONLY the bullet list. No headings. No sections. No markdown formatting other than "- " bullets. No preamble.`
      : `## Daily Standup — ${today}

### What I worked on

**Features**
- [bullet for each feature item, or "None today." if empty]

**Fixes**
- [bullet for each fix item, or "None today." if empty]

**Maintenance**
- [bullet for each maintenance item, or "None today." if empty]

### Summary
[2-3 sentence narrative paragraph. ${
          persona === "manager"
            ? "Plain language for a product or business stakeholder."
            : "Technical language for a team lead or senior engineer."
        }]

### Blockers / Notes
[If there are obvious blockers or notable patterns, mention them. Otherwise write "None identified."]`;

  return `
You are a developer productivity assistant. Your task is to generate a concise daily standup summary for the developer "${username}".

${personaInstruction}

## Raw Activity Data (last 24 hours)

### Commits
${commitLines}

### Pull Requests
${prLines}

## Instructions

1. Analyze the commits and PRs above.
${
  persona === "client"
    ? `2. ${mainFormat}
4. Do NOT include commit SHAs, repo paths, or branch names.
5. If there is NO activity at all, write a single bullet: "- No changes made today."`
    : `2. Categorize each item into one of three categories:
   - **Features**: New functionality, new pages, new API endpoints, new integrations
   - **Fixes**: Bug fixes, error handling, correcting broken behavior
   - **Maintenance**: Refactoring, dependency updates, config changes, tests, docs
3. Write a standup summary in the following EXACT markdown format:

${mainFormat}

4. Do NOT include commit SHAs or raw repo paths in the output — humanize the content.
5. Keep bullets concise (one line each, max 15 words).
6. If there is NO activity at all, produce the template but note "No activity recorded in the last 24 hours." in each section.`
}

Respond with ONLY the content above, then immediately output the WhatsApp section below — no preamble, no explanation, no code fences before the WhatsApp delimiter.

${WA_START}
Write a single WhatsApp paragraph (3–5 sentences, max 60 words) summarising today's work for a non-technical client.
Plain English only. Past tense. No bullet points. No technical terms. No emojis. No "Here is" opener.
Start directly with what was done, e.g. "Added full support for..." or "Updated the checkout flow...".
${WA_END}
`.trim();
}

export async function synthesizeWithGemini(
  activity: GitHubActivity,
  persona: Persona
): Promise<{ markdown: string; whatsappMessage: string }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 1024,
    },
  });

  const prompt = buildPrompt(activity, persona);
  const result = await model.generateContent(prompt);
  let text = result.response.text();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  // Split off the WhatsApp section
  const waStartIdx = text.indexOf(WA_START);
  let markdown = text;
  let whatsappMessage = "";

  if (waStartIdx !== -1) {
    markdown = text.slice(0, waStartIdx).trim();
    const waSection = text.slice(waStartIdx + WA_START.length);
    const waEndIdx = waSection.indexOf(WA_END);
    whatsappMessage = (waEndIdx !== -1 ? waSection.slice(0, waEndIdx) : waSection).trim();
  }

  // Strip wrapping code fences from the markdown portion only
  markdown = markdown.replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "").trim();

  return { markdown, whatsappMessage };
}
