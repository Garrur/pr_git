import Groq from 'groq-sdk';
import { config } from '../config/validateEnv';
import type { LLMChunk, ReviewComment, PRReview, ReviewEvent, ReviewSeverity } from '../types';
import pino from 'pino';

const log = pino({ name: 'llm-reviewer', level: config.LOG_LEVEL });

const client = new Groq({ apiKey: config.GROQ_API_KEY });

/** WHY: 3 concurrent LLM calls balances throughput vs. rate-limit risk */
const MAX_CONCURRENCY = 3;

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior software engineer performing a code review.
Analyze the provided unified diff and return a JSON array of review comments.

RULES:
- Return ONLY valid JSON. No markdown, no explanation outside JSON.
- Each comment must follow this exact schema:
  {
    "path": "string (file path)",
    "line": number (line number in new file),
    "side": "RIGHT",
    "body": "string (actionable review comment)",
    "severity": "bug" | "security" | "performance" | "reliability" | "style" | "nitpick"
  }
- Only comment on changed lines (additions/modifications).
- Be specific and actionable. Reference the exact code.
- Skip trivial style issues unless they create real risk.
- If there is nothing to comment on, return an empty array [].`;

// ─── LLM Chunk Reviewer ───────────────────────────────────────────────────────

interface RawComment {
  path: string;
  line: number;
  side: string;
  body: string;
  severity: string;
}

const VALID_SEVERITIES = new Set<string>([
  'bug', 'security', 'performance', 'reliability', 'style', 'nitpick',
]);

function parseComments(jsonStr: string): ReviewComment[] {
  const parsed = JSON.parse(jsonStr) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON array');
  }

  const comments: ReviewComment[] = [];

  for (const item of parsed) {
    const raw = item as RawComment;

    if (
      typeof raw.path !== 'string' ||
      typeof raw.line !== 'number' ||
      typeof raw.body !== 'string' ||
      !VALID_SEVERITIES.has(raw.severity)
    ) {
      // Skip malformed entries rather than failing the whole review
      log.warn({ item }, 'Skipping malformed comment from LLM');
      continue;
    }

    comments.push({
      path: raw.path,
      line: Math.round(raw.line), // ensure integer
      side: raw.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: raw.body,
      severity: raw.severity as ReviewSeverity,
    });
  }

  return comments;
}

/**
 * Sends a single diff chunk to Groq and parses comments.
 * Retries once on JSON parse failure because LLMs occasionally
 * wrap output in markdown fences under load.
 */
async function reviewChunk(chunk: LLMChunk): Promise<ReviewComment[]> {
  const diffText = chunk.files.map((f) => f.content).join('\n\n');

  const userMessage = `Review the following diff and return a JSON array of comments:\n\n${diffText}`;

  async function call(): Promise<string> {
    const msg = await client.chat.completions.create({
      model: config.LLM_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2,
    });

    const text = msg.choices[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error('Unexpected LLM response structure');
    }
    return text.trim();
  }

  let rawText: string;

  try {
    rawText = await call();
  } catch (err) {
    log.error({ err }, 'LLM call failed');
    return []; // graceful: return empty rather than crash
  }

  // Strip markdown fences if LLM wrapped the JSON
  const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return parseComments(cleaned);
  } catch (firstErr) {
    log.warn({ firstErr }, 'First JSON parse failed, retrying LLM call');

    // One retry – give the model a second chance with an explicit instruction
    try {
      const retryText = await call();
      const retryCleaned = retryText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return parseComments(retryCleaned);
    } catch (retryErr) {
      log.error({ retryErr }, 'LLM retry also failed – returning empty comments for chunk');
      return []; // never throw – caller merges results
    }
  }
}

// ─── Concurrency Limiter ──────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++;
      const task = tasks[taskIndex];
      if (!task) continue;
      // eslint-disable-next-line no-await-in-loop
      results[taskIndex] = await task();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Verdict Logic ────────────────────────────────────────────────────────────

/**
 * Derives the overall review verdict from the merged comment list.
 *
 * WHY this ordering: bugs and security issues demand changes; performance and
 * reliability issues are informational; anything else can APPROVE.
 */
function deriveVerdict(comments: ReviewComment[]): ReviewEvent {
  const severities = new Set(comments.map((c) => c.severity));

  if (severities.has('bug') || severities.has('security')) {
    return 'REQUEST_CHANGES';
  }

  if (severities.has('performance') || severities.has('reliability')) {
    return 'COMMENT';
  }

  return 'APPROVE';
}

function buildSummary(comments: ReviewComment[], event: ReviewEvent): string {
  if (comments.length === 0) {
    return '✅ No issues found. LGTM!';
  }

  const bySeverity: Record<string, number> = {};
  for (const c of comments) {
    bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
  }

  const breakdown = Object.entries(bySeverity)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');

  const verdict =
    event === 'REQUEST_CHANGES'
      ? '🔴 Changes requested'
      : event === 'COMMENT'
        ? '🟡 Review with suggestions'
        : '🟢 Approved with minor notes';

  return `${verdict} — Found ${comments.length} issue(s): ${breakdown}.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reviews all diff chunks and merges results into a single PRReview.
 *
 * @param chunks - LLM-ready diff chunks from chunkForLLM()
 * @returns Merged PRReview ready to post via octokit
 */
export async function reviewChunks(chunks: LLMChunk[]): Promise<PRReview> {
  if (config.GROQ_API_KEY === 'your_groq_api_key_here' || config.GROQ_API_KEY === 'mock') {
    log.info('Running in MOCK mode to bypass LLM');
    return { 
      event: 'COMMENT', 
      body: '🤖 **PR Pilot MOCK Mode**\n\nYou did not provide a valid API Key, so I am just verifying your webhook connection works! The end-to-end system is fully operational.', 
      comments: [] 
    };
  }

  if (chunks.length === 0) {
    return { event: 'APPROVE', body: '✅ No reviewable changes found.', comments: [] };
  }

  const tasks = chunks.map((chunk) => () => reviewChunk(chunk));
  const resultsPerChunk = await runWithConcurrency(tasks, MAX_CONCURRENCY);

  const allComments = resultsPerChunk.flat();
  const event = deriveVerdict(allComments);
  const body = buildSummary(allComments, event);

  log.info({ totalComments: allComments.length, event }, 'Review complete');

  return { event, body, comments: allComments };
}
