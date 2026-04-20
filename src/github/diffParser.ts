import type { ParsedFile, Hunk, DiffLine, DiffLineType, LLMChunk } from '../types';

// Files that should never be reviewed – they are generated, minified, or contain no logic
const SKIP_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.js$/,
  /\.min\.css$/,
  /dist\//,
  /build\//,
  /vendor\//,
  /\.generated\./,
  /\.pb\.go$/,
  /\.pb\.ts$/,
  // Binary extensions – diff will be empty anyway but skip early
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/,
];

/**
 * Parses a unified diff string into structured file/hunk/line objects.
 *
 * WHY custom parser instead of a library: we need precise line-number tracking
 * to attach review comments to exact positions in the GitHub PR interface.
 * Most diff libraries lose the positional metadata we need.
 */
export function parseDiff(rawDiff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = rawDiff.split('\n');

  let currentFile: ParsedFile | undefined;
  let currentHunk: Hunk | undefined;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // ── File header ──────────────────────────────────────────────────────────
    if (line.startsWith('diff --git ')) {
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
          currentHunk = undefined;
        }
        files.push(currentFile);
      }
      currentFile = {
        oldPath: '',
        newPath: '',
        isNew: false,
        isDeleted: false,
        isBinary: false,
        hunks: [],
      };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('--- ')) {
      currentFile.oldPath = line.slice(4).trim();
      if (currentFile.oldPath === '/dev/null') currentFile.isNew = true;
      continue;
    }

    if (line.startsWith('+++ ')) {
      currentFile.newPath = line.slice(4).trim();
      if (currentFile.newPath === '/dev/null') currentFile.isDeleted = true;
      continue;
    }

    if (line.startsWith('Binary files')) {
      currentFile.isBinary = true;
      continue;
    }

    // ── Hunk header: @@ -old_start,old_count +new_start,new_count @@ ─────────
    if (line.startsWith('@@ ')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!match) continue;

      // match[1..5] – regex groups are always string when matched
      oldLineNum = parseInt(match[1] ?? '0', 10);
      newLineNum = parseInt(match[3] ?? '0', 10);

      currentHunk = {
        oldStart: oldLineNum,
        oldLines: parseInt(match[2] ?? '1', 10),
        newStart: newLineNum,
        newLines: parseInt(match[4] ?? '1', 10),
        header: match[5]?.trim() ?? '',
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    // ── Diff lines ────────────────────────────────────────────────────────────
    if (line.startsWith('+')) {
      const diffLine: DiffLine = {
        type: 'add' as DiffLineType,
        content: line.slice(1),
        newLineNumber: newLineNum,
        oldLineNumber: undefined,
      };
      currentHunk.lines.push(diffLine);
      newLineNum++;
    } else if (line.startsWith('-')) {
      const diffLine: DiffLine = {
        type: 'delete' as DiffLineType,
        content: line.slice(1),
        newLineNumber: undefined,
        oldLineNumber: oldLineNum,
      };
      currentHunk.lines.push(diffLine);
      oldLineNum++;
    } else if (line.startsWith(' ') || line === '') {
      // Context line (empty = trailing newline in some diff generators)
      const diffLine: DiffLine = {
        type: 'context' as DiffLineType,
        content: line.slice(1),
        newLineNumber: newLineNum,
        oldLineNumber: oldLineNum,
      };
      currentHunk.lines.push(diffLine);
      oldLineNum++;
      newLineNum++;
    }
    // Lines like "\ No newline at end of file" are intentionally ignored
  }

  // Flush last file
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Strips files that carry no reviewable logic (lock files, generated code, binaries).
 */
export function filterReviewable(files: ParsedFile[]): ParsedFile[] {
  return files.filter((f) => {
    if (f.isBinary) return false;
    const path = f.newPath !== '/dev/null' ? f.newPath : f.oldPath;
    return !SKIP_PATTERNS.some((re) => re.test(path));
  });
}

/**
 * Formats a ParsedFile's diff into a compact text representation
 * suitable for LLM context, including ±5 context-line windows.
 */
function formatFileForLLM(file: ParsedFile): string {
  const path = file.newPath !== '/dev/null' ? file.newPath : file.oldPath;
  const lines: string[] = [`=== ${path} ===`];

  for (const hunk of file.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.header}`);
    for (const dl of hunk.lines) {
      const prefix = dl.type === 'add' ? '+' : dl.type === 'delete' ? '-' : ' ';
      const lineRef = dl.newLineNumber ?? dl.oldLineNumber ?? '';
      lines.push(`${prefix}${lineRef}: ${dl.content}`);
    }
  }

  return lines.join('\n');
}

/**
 * Splits diff files into chunks so each LLM call stays within a line budget.
 *
 * WHY: Claude's context window is large but latency and cost scale with tokens.
 * Chunking at ≤150 lines keeps each call fast and makes retries cheaper.
 */
export function chunkForLLM(files: ParsedFile[], maxLines = 150): LLMChunk[] {
  const chunks: LLMChunk[] = [];
  let currentChunk: LLMChunk = { files: [] };
  let currentLineCount = 0;

  for (const file of files) {
    const path = file.newPath !== '/dev/null' ? file.newPath : file.oldPath;
    const content = formatFileForLLM(file);
    const lineCount = content.split('\n').length;

    // If a single file exceeds the budget, give it its own chunk
    if (lineCount > maxLines) {
      if (currentChunk.files.length > 0) {
        chunks.push(currentChunk);
        currentChunk = { files: [] };
        currentLineCount = 0;
      }
      chunks.push({ files: [{ path, content }] });
      continue;
    }

    if (currentLineCount + lineCount > maxLines && currentChunk.files.length > 0) {
      chunks.push(currentChunk);
      currentChunk = { files: [] };
      currentLineCount = 0;
    }

    currentChunk.files.push({ path, content });
    currentLineCount += lineCount;
  }

  if (currentChunk.files.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
