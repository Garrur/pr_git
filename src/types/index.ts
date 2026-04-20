// ─── GitHub Webhook Payloads ──────────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  full_name: string;
  owner: { login: string };
  name: string;
  private: boolean;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  id: number;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
  user: GitHubUser;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PullRequestEvent {
  action: 'opened' | 'synchronize' | 'reopened' | 'closed' | 'edited';
  number: number;
  pull_request: PullRequest;
  repository: GitHubRepo;
  installation: { id: number };
}

// ─── Diff Parsing ─────────────────────────────────────────────────────────────

export type DiffLineType = 'context' | 'add' | 'delete';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** Line number in the NEW file (undefined for delete-only lines) */
  newLineNumber: number | undefined;
  /** Line number in the OLD file (undefined for add-only lines) */
  oldLineNumber: number | undefined;
}

export interface Hunk {
  /** Starting line in old file */
  oldStart: number;
  oldLines: number;
  /** Starting line in new file */
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface ParsedFile {
  /** a/path or /dev/null */
  oldPath: string;
  /** b/path or /dev/null */
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  hunks: Hunk[];
}

// ─── LLM Interaction ─────────────────────────────────────────────────────────

/** A chunk of diff lines sent to the LLM in a single call */
export interface LLMChunk {
  files: Array<{
    path: string;
    content: string; // formatted diff text
  }>;
}

// ─── Review Output ────────────────────────────────────────────────────────────

export type ReviewSeverity = 'bug' | 'security' | 'performance' | 'reliability' | 'style' | 'nitpick';

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ReviewComment {
  path: string;
  line: number;
  /** Side of the diff – always RIGHT (new file) for new issues */
  side: 'RIGHT' | 'LEFT';
  body: string;
  severity: ReviewSeverity;
}

export interface PRReview {
  event: ReviewEvent;
  body: string;
  comments: ReviewComment[];
}

// ─── Queue Job ───────────────────────────────────────────────────────────────

export interface PRReviewJob {
  jobId: string;
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  /** ISO timestamp of when the job was enqueued */
  enqueuedAt: string;
}
