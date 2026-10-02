import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { cleanDiff } from "@/lib/clean-diff";
import type { GitHubActivity } from "@/types/github";
import { clampMessageCount, type MessageCount, type Persona } from "@/types/standup";
import type { QualityScore } from "@/types/team";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const WA_START = "---WHATSAPP_START---";
const WA_END = "---WHATSAPP_END---";

const MIS_RULES = `You are responsible for converting technical work and commit descriptions into short, simple, professional work-update messages.

Follow these rules strictly:

1. OUTPUT FORMAT
- Each message is a single short paragraph suitable for a WhatsApp/work update.
- Do not use bullet points.
- Do not include commit hashes, file paths, or unnecessary implementation details.
- The final output should be ready to copy and send directly.

2. WRITING STYLE
- Keep it simple, clear, and professional.
- Make it sound like a human work update, not a commit message.
- Summarize multiple technical changes into a few understandable points.
- Focus on what was improved, added, fixed, or updated and the practical outcome.
- Avoid excessive technical details.
- Do not use first-person wording such as "I worked on", "I added", or "I fixed".
- Prefer wording such as "Updated...", "Improved...", "Added...", "Implemented...", "Fixed...", "Enhanced...".
- Keep the message concise but meaningful.

3. REMOVE UNNECESSARY PROJECT/GAME NAMES
- Do NOT mention specific game, product, project, or client names.
- Replace specific names with generic terms such as "application", "platform", "admin panel", "backend", "frontend", "client", "system", or "feature".
- Avoid unnecessary game-specific or gambling-related terminology.
- For example: "Updated the Lucky Star betting flow" becomes "Updated the ticket and payment flow."

4. SIMPLIFY TECHNICAL DETAILS
Convert technical implementation into understandable outcomes.
- "Added recursive CTE for descendant IDs" becomes "Updated user management to apply actions across the entire downline."
- "Implemented findOneAndUpdate with arrayFilters" becomes "Improved result updates to prevent conflicts during simultaneous changes."
- "Added Prisma retention scheduler" becomes "Added automatic cleanup for old records."
- "Changed to IST-aware date ranges" becomes "Fixed date and timezone handling to prevent incorrect report ranges."
- "Added MongoDB index on sessionId" becomes "Improved session lookup performance."

5. GROUP RELATED CHANGES
- Combine related changes into one sentence where possible.
- Do not list every individual change.
- Prioritize major features, important fixes, reliability improvements, performance improvements, and user-facing changes.
- Mention infrastructure, database, migration, or deployment work when it is significant.

6. KEEP IMPORTANT WORK
Do not oversimplify to the point where major work disappears. Significant infrastructure work, such as moving a database from a free-tier setup to a company server, should remain in the summary.

7. TONE
- Professional but simple.
- Easy for a manager or teammate to understand.
- Natural and not overly formal.
- Avoid complicated technical language unless it is important to the update.

8. NO EXTRA EXPLANATION
Directly provide the finished work-update message. Do not explain how it was summarized.

9. LENGTH
- Normally keep each message around 2–4 sentences in one paragraph.

10. IMPORTANT
Describe the overall work rather than repeating the technical changelog. Turn complex developer changes into a clear, concise progress update.`;

function misCountInstructions(count: MessageCount): string {
  if (count === 1) {
    return `Write exactly 1 message covering the overall work.`;
  }
  return `Write exactly ${count} messages.
Split the real work so the messages do not overlap.
Each commit, pull request, feature, fix, and outcome may appear in only one message.
Do not restate a message inside another message.
Do not invent work to fill a message.
If there is less distinct work than ${count} messages, give the remaining detail to the earliest messages and keep any leftover message to a single sentence about work that has not already been used.
Together, the messages should cover the important work without repeating it.`;
}

function parseMisMessages(text: string, count: MessageCount): string[] {
  const cleaned = text.replace(/^```(?:markdown|text)?\n?/, "").replace(/\n?```$/, "").trim();
  const messages: string[] = [];
  for (let i = 1; i <= count; i++) {
    const marker = new RegExp(`---MESSAGE_${i}---`, "i");
    const match = marker.exec(cleaned);
    if (!match) continue;
    const rest = cleaned.slice(match.index + match[0].length);
    const next = rest.search(/---MESSAGE_\d+---/i);
    const body = (next === -1 ? rest : rest.slice(0, next))
      .replace(WA_START, "")
      .replace(WA_END, "")
      .trim();
    if (body) messages.push(body);
  }
  if (messages.length > 0) return messages.slice(0, count);
  const fallback = cleaned
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^message\s*\d+\s*[:.-]\s*/i, "").trim())
    .filter(Boolean);
  return (fallback.length > 0 ? fallback : [cleaned]).slice(0, count);
}

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
          .map((c) => {
            if (c.diff) {
              const cleaned = cleanDiff(c.diff);
              return `### [${c.sha}] ${c.repoName}: ${c.message}\n\`\`\`diff\n${cleaned}\n\`\`\``;
            }
            return `- [${c.repoName}] ${c.message} (${c.sha})`;
          })
          .join("\n\n")
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
      : `You are writing for a TECHNICAL PEER or TEAM LEAD. Include technical context, reference specific systems where inferable from commit messages, and be precise about what changed and why it matters architecturally.`;

  const mainFormat = `## Daily Standup — ${today}

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

1. Analyze the commits and PRs above. Where a real code diff is provided inside a \`\`\`diff block, base your analysis on the actual code changes — not just the commit message.
2. Categorize each item into one of three categories:
   - **Features**: New functionality, new pages, new API endpoints, new integrations
   - **Fixes**: Bug fixes, error handling, correcting broken behavior
   - **Maintenance**: Refactoring, dependency updates, config changes, tests, docs
3. Write a standup summary in the following EXACT markdown format:

${mainFormat}

4. Do NOT include commit SHAs or raw repo paths in the output — humanize the content.
5. Keep bullets concise (one line each, max 15 words).
6. If there is NO activity at all, produce the template but note "No activity recorded in the last 24 hours." in each section.

After the main content above, output the WhatsApp section below — no preamble, no explanation, no code fences before the WhatsApp delimiter.

${WA_START}
Write a WhatsApp update message (100–150 words) summarising today's work.
Write in third-person action style — NO "I" anywhere. Start each sentence with the action verb directly.
Use starters like: "Created", "Updated", "Fixed", "Added", "Built", "Implemented", "Changed", "Removed", "Improved".
Plain English. Past tense. No bullet points. No emojis. No "Here is" opener. No technical jargon (no "repo", "diff", "refactor", "SHA").
Be specific about what was built or fixed. List each thing in one sentence.
${WA_END}
`.trim();
}

function buildMisPrompt(activity: GitHubActivity, count: MessageCount): string {
  const { commits, pullRequests } = activity;
  const commitLines =
    commits.length > 0
      ? commits
          .map((c) => {
            if (c.diff) {
              return `### ${c.repoName}: ${c.message}\n\`\`\`diff\n${cleanDiff(c.diff)}\n\`\`\``;
            }
            return `- ${c.repoName}: ${c.message}`;
          })
          .join("\n\n")
      : "No commits in the selected window.";
  const prLines =
    pullRequests.length > 0
      ? pullRequests
          .map((pr) => `- ${pr.repoName}: "${pr.title}" (${pr.state})`)
          .join("\n")
      : "No pull requests in the selected window.";
  const markers = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `---MESSAGE_${n}---\n<message ${n}>`;
  }).join("\n");

  return `${MIS_RULES}

${misCountInstructions(count)}

Use the activity below only as source material. Do not copy commit messages, repository names, or code into the update.

### Commits
${commitLines}

### Pull Requests
${prLines}

Return only the message markers below and the finished paragraphs. No title, no bullets, no explanation.
${markers}`.trim();
}

export async function synthesizeWithGemini(
  activity: GitHubActivity,
  persona: Persona,
  messageCount = 1
): Promise<{ markdown: string; whatsappMessage: string; messages: string[]; tokenCount: number }> {
  const count = clampMessageCount(messageCount);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: persona === "mis" ? 0.3 : 0.4,
      topP: 0.9,
      maxOutputTokens: persona === "mis" ? 1200 : 1500,
    },
  });

  const prompt = persona === "mis" ? buildMisPrompt(activity, count) : buildPrompt(activity, persona);
  const result = await model.generateContent(prompt);
  let text = result.response.text();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const tokenCount = result.response.usageMetadata?.totalTokenCount ?? 0;

  if (persona === "mis") {
    const messages = parseMisMessages(text, count);
    const markdown = messages.join("\n\n");
    return { markdown, whatsappMessage: markdown, messages, tokenCount };
  }

  const waStartIdx = text.indexOf(WA_START);
  let markdown = text;
  let whatsappMessage = "";

  if (waStartIdx !== -1) {
    markdown = text.slice(0, waStartIdx).trim();
    const waSection = text.slice(waStartIdx + WA_START.length);
    const waEndIdx = waSection.indexOf(WA_END);
    whatsappMessage = (waEndIdx !== -1 ? waSection.slice(0, waEndIdx) : waSection).trim();
  }

  markdown = markdown.replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "").trim();

  return { markdown, whatsappMessage, messages: whatsappMessage ? [whatsappMessage] : [], tokenCount };
}

export async function scoreWithGemini(
  activity: GitHubActivity
): Promise<QualityScore | null> {
  const diffs = activity.commits
    .filter((c) => c.diff)
    .map((c) => `### ${c.sha} — ${c.message}\n${cleanDiff(c.diff!)}`)
    .join("\n\n");

  if (!diffs) return null;

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 512,
    },
  });

  const prompt = `Act as a Senior Code Auditor. Analyze the provided Git diff on three criteria:
- Functionality: Does the code logically achieve the task? (0-40 points)
- Best Practices: Clean code, DRY, naming conventions, error handling? (0-40 points)
- Scalability: Is the solution efficient and sustainable? (0-20 points)

Return ONLY valid JSON with no preamble and no markdown fences:
{
  "total_score": <number 0-100>,
  "breakdown": { "functionality": <number 0-40>, "quality": <number 0-40>, "scalability": <number 0-20> },
  "critical_feedback": "<one concise sentence>"
}

## Git Diff
${diffs}`.trim();

  try {
    const result = await model.generateContent(prompt);
    const text = result.response
      .text()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    const parsed = JSON.parse(text) as QualityScore;
    return parsed;
  } catch {
    return null;
  }
}

export async function synthesizeWeekly(
  entriesText: string,
  persona: Persona,
  messageCount = 1
): Promise<{ markdown: string; whatsappMessage: string; messages: string[]; tokenCount: number }> {
  const count = clampMessageCount(messageCount);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: persona === "mis" ? 0.3 : 0.4,
      topP: 0.9,
      maxOutputTokens: 1800,
    },
  });

  const markers = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `---MESSAGE_${n}---\n<message ${n}>`;
  }).join("\n");

  const audience =
    persona === "manager"
      ? "a product manager. Plain language, business impact, no jargon."
      : "engineers. Keep useful technical detail, but stay concise.";

  const prompt =
    persona === "mis"
      ? `${MIS_RULES}

${misCountInstructions(count)}

These notes are from the last 7 days. Turn them into the requested work-update messages. Do not repeat work across messages.

## Daily notes
${entriesText}

Return only the message markers below and the finished paragraphs.
${markers}`.trim()
      : `Combine these daily standup notes from the last 7 days into one weekly update for ${audience}

Markdown sections:
## Shipped
## In progress
## Blockers

Then a WhatsApp recap between these exact markers:
${WA_START}
100–150 words, third person, past tense, no bullets, no emojis.
${WA_END}

## Daily notes
${entriesText}`.trim();

  const result = await model.generateContent(prompt);
  let text = result.response.text();
  if (!text) throw new Error("Gemini returned an empty weekly summary.");

  const tokenCount = result.response.usageMetadata?.totalTokenCount ?? 0;

  if (persona === "mis") {
    const messages = parseMisMessages(text, count);
    const markdown = messages.join("\n\n");
    return { markdown, whatsappMessage: markdown, messages, tokenCount };
  }

  const waStartIdx = text.indexOf(WA_START);
  let markdown = text;
  let whatsappMessage = "";

  if (waStartIdx !== -1) {
    markdown = text.slice(0, waStartIdx).trim();
    const waSection = text.slice(waStartIdx + WA_START.length);
    const waEndIdx = waSection.indexOf(WA_END);
    whatsappMessage = (waEndIdx !== -1 ? waSection.slice(0, waEndIdx) : waSection).trim();
  }

  markdown = markdown.replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "").trim();
  return { markdown, whatsappMessage, messages: whatsappMessage ? [whatsappMessage] : [], tokenCount };
}
