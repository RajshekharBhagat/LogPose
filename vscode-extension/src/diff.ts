const SKIP_FILE_PATTERNS = [
  /\.(lock)$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|otf|bmp|tiff?)$/i,
  /\.(min\.js|min\.css)$/i,
  /^(dist|build|\.next|out)\//i,
];

const MAX_DIFF_LINES_PER_FILE = 60;

function shouldSkipFile(filePath: string, content: string): boolean {
  if (content.includes("Binary files") || content.includes("GIT binary patch")) {
    return true;
  }

  return SKIP_FILE_PATTERNS.some((pat) => pat.test(filePath));
}

function extractFilePath(header: string): string {
  const match = header.match(/^diff --git a\/(.+) b\/.+$/m);
  return match?.[1] ?? header;
}

function truncateHunk(section: string): string {
  const lines = section.split("\n");
  const diffLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i]?.[0];
    if (ch === "+" || ch === "-" || ch === " ") diffLines.push(i);
  }

  if (diffLines.length <= MAX_DIFF_LINES_PER_FILE) return section;

  const keepLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i]?.[0];
    if (ch !== "+" && ch !== "-" && ch !== " ") keepLines.add(i);
  }

  for (let i = 0; i < MAX_DIFF_LINES_PER_FILE; i++) {
    keepLines.add(diffLines[i]);
  }

  const truncated = lines.filter((_, i) => keepLines.has(i)).join("\n");
  const skipped = diffLines.length - MAX_DIFF_LINES_PER_FILE;
  return `${truncated}\n... [${skipped} more lines omitted]`;
}

export function cleanDiff(rawDiff: string, maxTotalChars: number): string {
  if (!rawDiff.trim()) return "";

  const sections = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);
  let kept = 0;
  let skipped = 0;
  const parts: string[] = [];

  for (const section of sections) {
    const filePath = extractFilePath(section);
    if (shouldSkipFile(filePath, section)) {
      skipped++;
      continue;
    }
    parts.push(truncateHunk(section.trimEnd()));
    kept++;
  }

  const header = `# Diff: ${kept} file${kept !== 1 ? "s" : ""} changed, ${skipped} skipped\n\n`;
  let output = header + parts.join("\n\n");

  if (output.length > maxTotalChars) {
    output = output.slice(0, maxTotalChars) + "\n... [diff truncated]";
  }

  return output;
}
