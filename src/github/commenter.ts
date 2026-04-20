import type { Octokit } from '@octokit/rest';
import type { PRReview, ReviewComment } from '../types';
import pino from 'pino';
import { config } from '../config/validateEnv';

const log = pino({ name: 'commenter', level: config.LOG_LEVEL });

interface OctokitError {
  status: number;
  response?: {
    headers: Record<string, string | undefined>;
  };
}

function isOctokitError(err: unknown): err is OctokitError {
  return typeof err === 'object' && err !== null && 'status' in err;
}

/**
 * Waits until GitHub's rate-limit window resets.
 *
 * WHY: posting review comments is subject to secondary rate limits.
 * A 403 with x-ratelimit-reset tells us exactly when to retry.
 */
async function waitForRateLimitReset(err: OctokitError): Promise<void> {
  const resetHeader = err.response?.headers['x-ratelimit-reset'];
  const resetAt = resetHeader ? parseInt(resetHeader, 10) * 1000 : Date.now() + 60_000;
  const waitMs = Math.max(resetAt - Date.now(), 5_000); // minimum 5-second wait

  log.warn({ waitMs }, 'Rate-limited by GitHub – waiting before retry');
  await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

/**
 * Validates that a comment's line number actually exists in the diff.
 *
 * WHY: GitHub rejects createReview() if ANY comment has an invalid position.
 * The whole batch fails, not just the bad comment. We must pre-filter.
 */
function validateComment(comment: ReviewComment, validLines: Map<string, Set<number>>): boolean {
  const linesForFile = validLines.get(comment.path);
  if (!linesForFile) {
    log.debug({ path: comment.path }, 'Dropping comment – file not in diff');
    return false;
  }
  if (!linesForFile.has(comment.line)) {
    log.debug({ path: comment.path, line: comment.line }, 'Dropping comment – line not in diff');
    return false;
  }
  return true;
}

/**
 * Builds a set of valid (path, newLineNumber) pairs from the raw diff.
 * Used to validate comment positions before posting.
 */
export function buildValidLineMap(
  diffFiles: Array<{ newPath: string; hunks: Array<{ lines: Array<{ newLineNumber: number | undefined }> }> }>,
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();

  for (const file of diffFiles) {
    const path = file.newPath.replace(/^b\//, '');
    const lineSet = new Set<number>();

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.newLineNumber !== undefined) {
          lineSet.add(line.newLineNumber);
        }
      }
    }

    if (lineSet.size > 0) {
      map.set(path, lineSet);
    }
  }

  return map;
}

/**
 * Posts all review comments in a single API call.
 *
 * WHY single call: GitHub's /pulls/:id/reviews endpoint accepts a batch.
 * Multiple individual comment calls would trigger secondary rate limits
 * and create a noisy review thread.
 */
export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  review: PRReview,
  validLines: Map<string, Set<number>>,
): Promise<void> {
  const safeComments = review.comments
    .filter((c) => validateComment(c, validLines))
    .map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
    }));

  const dropped = review.comments.length - safeComments.length;
  if (dropped > 0) {
    log.warn({ dropped }, 'Dropped comments with invalid line positions');
  }

  async function attempt(): Promise<void> {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: review.event,
      body: review.body,
      comments: safeComments,
    });
  }

  try {
    await attempt();
    log.info({ owner, repo, prNumber, comments: safeComments.length }, 'Review posted');
  } catch (err) {
    if (isOctokitError(err) && err.status === 403) {
      // Rate-limited – wait for reset window and retry once
      await waitForRateLimitReset(err);

      try {
        await attempt();
        log.info({ owner, repo, prNumber }, 'Review posted after rate-limit retry');
      } catch (retryErr) {
        log.error({ retryErr, owner, repo, prNumber }, 'Review post failed after retry');
        throw retryErr;
      }
    } else {
      throw err;
    }
  }
}
