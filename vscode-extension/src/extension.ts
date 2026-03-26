import * as vscode from "vscode";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cleanDiff } from "./diff";
import {
  getStagedDiff,
  getStagedNameStatus,
  hasStagedChanges,
  type GitApiLike,
  type GitExtension,
  type GitRepoLike,
} from "./git";

type LogPoseConfig = {
  apiKey: string;
  model: string;
  maxDiffChars: number;
  conventionalCommits: boolean;
};

function getConfig(): LogPoseConfig {
  const cfg = vscode.workspace.getConfiguration("logpose");
  return {
    apiKey: cfg.get<string>("apiKey", "").trim(),
    model: cfg.get<string>("model", "gemini-2.5-flash-lite"),
    maxDiffChars: cfg.get<number>("maxDiffChars", 9000),
    conventionalCommits: cfg.get<boolean>("conventionalCommits", true),
  };
}

async function getGitApi(): Promise<GitApiLike | null> {
  const gitExt = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExt) return null;
  if (!gitExt.isActive) {
    await gitExt.activate();
  }
  return gitExt.exports.getAPI(1);
}

function pickRepo(api: GitApiLike): GitRepoLike | null {
  if (!api.repositories.length) return null;

  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!activeFile) return api.repositories[0];

  const matching = api.repositories.find((r) => activeFile.startsWith(r.rootUri.fsPath));
  return matching ?? api.repositories[0];
}

function buildPrompt(
  stagedSummary: string,
  cleanedDiff: string,
  conventionalCommits: boolean
): string {
  return `
You generate high-quality git commit messages from staged changes.

Rules:
- Return ONLY the commit message text, no code fences, no explanation.
- Subject line max 72 characters.
- Use imperative mood.
- Be specific and concise.
${conventionalCommits ? "- Use Conventional Commits format: type(scope): subject" : "- Plain concise git commit subject is fine."}
- If there are multiple logical changes, include a short body with bullet points.

Staged file summary:
${stagedSummary || "(not available)"}

Staged diff:
${cleanedDiff}
`.trim();
}

async function generateCommitMessage(
  cfg: LogPoseConfig,
  stagedSummary: string,
  cleanedDiff: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({
    model: cfg.model,
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 220,
    },
  });

  const result = await model.generateContent(
    buildPrompt(stagedSummary, cleanedDiff, cfg.conventionalCommits)
  );
  const text = result.response.text().trim();
  if (!text) throw new Error("AI returned an empty commit message.");
  return text.replace(/^```(?:\w+)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

async function doGenerateAndFill(): Promise<{ repo: GitRepoLike; message: string } | null> {
  const api = await getGitApi();
  if (!api) {
    await vscode.window.showErrorMessage("Git extension API not available yet. Reload and try again.");
    return null;
  }

  const repo = pickRepo(api);
  if (!repo) {
    await vscode.window.showErrorMessage("No git repository found in the current workspace.");
    return null;
  }

  const cfg = getConfig();
  if (!cfg.apiKey) {
    const action = await vscode.window.showErrorMessage(
      "Set logpose.apiKey in Settings before generating commit messages.",
      "Open Settings"
    );
    if (action === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "logpose.apiKey");
    }
    return null;
  }

  const cwd = repo.rootUri.fsPath;
  if (!(await hasStagedChanges(cwd))) {
    await vscode.window.showWarningMessage("No staged changes found. Stage files first, then generate.");
    return null;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "LogPose: generating commit message from staged diff...",
      cancellable: false,
    },
    async () => {
      const [rawDiff, stagedSummary] = await Promise.all([
        getStagedDiff(cwd),
        getStagedNameStatus(cwd),
      ]);

      const cleaned = cleanDiff(rawDiff, cfg.maxDiffChars);
      const message = await generateCommitMessage(cfg, stagedSummary.trim(), cleaned);
      repo.inputBox.value = message;
    }
  );

  const message = repo.inputBox.value.trim();
  if (!message) {
    await vscode.window.showErrorMessage("Generated message is empty.");
    return null;
  }

  await vscode.window.showInformationMessage("Commit message generated and inserted into Source Control.");
  return { repo, message };
}

export function activate(context: vscode.ExtensionContext): void {
  const generateDisposable = vscode.commands.registerCommand(
    "logpose.generateCommitMessage",
    async () => {
      try {
        await doGenerateAndFill();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        await vscode.window.showErrorMessage(`LogPose generation failed: ${msg}`);
      }
    }
  );

  const smartCommitDisposable = vscode.commands.registerCommand(
    "logpose.smartCommit",
    async () => {
      try {
        const result = await doGenerateAndFill();
        if (!result) return;

        const answer = await vscode.window.showInformationMessage(
          "Generated commit message. Commit staged changes now?",
          "Commit",
          "Cancel"
        );

        if (answer !== "Commit") return;
        await vscode.commands.executeCommand("git.commitStaged");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        await vscode.window.showErrorMessage(`LogPose smart commit failed: ${msg}`);
      }
    } 
  );

  context.subscriptions.push(generateDisposable, smartCommitDisposable);
}

export function deactivate(): void {
  // Nothing to dispose manually.
}
