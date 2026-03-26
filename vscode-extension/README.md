# LogPose Commit Assistant

Generate commit messages from staged git changes before committing.

## Commands

- `LogPose: Generate Commit Message`
- `LogPose: Smart Commit (Generate + Commit)`

## Settings

- `logpose.apiKey` - Gemini API key
- `logpose.model` - model name (default `gemini-2.5-flash-lite`)
- `logpose.maxDiffChars` - diff payload cap
- `logpose.conventionalCommits` - prefer Conventional Commits format

## Local development

1. Open `vscode-extension` folder in VS Code.
2. Run `npm install`.
3. Run `npm run compile`.
4. Press `F5` to launch Extension Development Host.
5. In a git repo, stage files and run command palette -> LogPose command.
