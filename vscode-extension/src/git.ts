import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitRepoLike = {
  rootUri: { fsPath: string };
  inputBox: { value: string };
};

export type GitApiLike = {
  repositories: GitRepoLike[];
};

export type GitExtension = {
  getAPI(version: 1): GitApiLike;
};

export async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout ?? "";
}

export async function getStagedDiff(cwd: string): Promise<string> {
  return runGit(["diff", "--staged", "--no-color"], cwd);
}

export async function getStagedNameStatus(cwd: string): Promise<string> {
  return runGit(["diff", "--staged", "--name-status"], cwd);
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
  const result = await runGit(["diff", "--staged", "--quiet"], cwd).then(
    () => false,
    () => true
  );
  return result;
}
