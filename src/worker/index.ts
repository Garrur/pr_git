import Redis from 'ioredis';
import { RedisKeys, type Job } from 'distri-task-sdk';
import { getInstallationClient } from '../github/client';
import { parseDiff, filterReviewable, chunkForLLM } from '../github/diffParser';
import { reviewChunks } from '../llm/reviewer';
import { postReview, buildValidLineMap } from '../github/commenter';
import type { PRReviewJob } from '../types';
import pino from 'pino';
import { config } from '../config/validateEnv';

const log = pino({ name: 'worker', level: config.LOG_LEVEL });

const QUEUE_NAME = 'pr-reviews';

/**
 * Priority polling order — matches distri-task-sdk's PRIORITIES constant.
 * Workers drain high-priority jobs first, then normal, then low.
 */
const PRIORITY_ORDER = ['high', 'normal', 'low'] as const;

// ─── Job Processor ───────────────────────────────────────────────────────────

/**
 * Processes a single PR review job end-to-end.
 *
 * Steps:
 *  1. Fetch diff from GitHub
 *  2. Parse + filter reviewable files
 *  3. Chunk for LLM
 *  4. Run LLM review (concurrent chunks)
 *  5. Post combined review to GitHub
 */
export async function processJob(job: PRReviewJob): Promise<void> {
  const { jobId, installationId, owner, repo, prNumber, headSha } = job;

  log.info({ jobId, owner, repo, prNumber }, 'Job started');

  // ── 1. GitHub client for this installation ──────────────────────────────────
  const octokit = await getInstallationClient(installationId);
  log.debug({ jobId }, 'Installation client obtained');

  // ── 2. Fetch diff ────────────────────────────────────────────────────────────
  let rawDiff: string;
  try {
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    });
    rawDiff = data as unknown as string;
  } catch (err) {
    log.error({ jobId, err }, 'Failed to fetch PR diff');
    throw err;
  }

  log.debug({ jobId, bytes: rawDiff.length }, 'Diff fetched');

  // ── 3. Parse + filter ────────────────────────────────────────────────────────
  const allFiles = parseDiff(rawDiff);
  const reviewableFiles = filterReviewable(allFiles);

  log.info({ jobId, totalFiles: allFiles.length, reviewableFiles: reviewableFiles.length }, 'Diff parsed');

  if (reviewableFiles.length === 0) {
    log.info({ jobId }, 'No reviewable files – posting trivial approval');
    await postReview(
      octokit, owner, repo, prNumber, headSha,
      { event: 'APPROVE', body: '✅ No reviewable source changes found (only lock files or generated code).', comments: [] },
      new Map(),
    );
    return;
  }

  // ── 4. Chunk for LLM ────────────────────────────────────────────────────────
  const chunks = chunkForLLM(reviewableFiles, 150);
  log.info({ jobId, chunks: chunks.length }, 'Diff chunked for LLM');

  // ── 5. LLM review ────────────────────────────────────────────────────────────
  let review;
  try {
    review = await reviewChunks(chunks);
  } catch (err) {
    log.error({ jobId, err }, 'LLM review failed entirely');
    throw err;
  }

  log.info({ jobId, comments: review.comments.length, event: review.event }, 'LLM review complete');

  // ── 6. Build valid line map + post review ────────────────────────────────────
  const validLines = buildValidLineMap(reviewableFiles);

  try {
    await postReview(octokit, owner, repo, prNumber, headSha, review, validLines);
  } catch (err) {
    log.error({ jobId, err }, 'Failed to post review to GitHub');
    throw err;
  }

  log.info({ jobId }, 'Job completed successfully');
}

// ─── Worker Pool ─────────────────────────────────────────────────────────────

/**
 * Worker pool that consumes jobs from distri-task-sdk's Redis data structures.
 *
 * WHY replicate the WorkerPool pattern here instead of importing from Distri core:
 * The Distri core's WorkerPool is tightly coupled to its own config, logger,
 * metrics, and error modules. Extracting it would require pulling the entire
 * Distri runtime. Instead, we implement the same reliable-queue pattern:
 *
 *  1. RPOPLPUSH from queue:<name>:waiting:<priority> → queue:<name>:processing
 *  2. HGETALL job:<id> to deserialize the full job
 *  3. Process the job
 *  4. On success: mark completed + LREM from processing
 *  5. On failure: increment attempts, move to delayed (retry) or dead (exhausted)
 *
 * This is fully compatible with Distri's Watchdog and Scheduler for stalled-job
 * recovery and delayed-job promotion.
 */
export class WorkerPool {
  private readonly redis: Redis;
  private readonly concurrency: number;
  private running = false;
  private activeJobs = 0;

  constructor(redisUrl: string, concurrency = 3) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.concurrency = concurrency;
  }

  async start(): Promise<void> {
    this.running = true;
    log.info({ concurrency: this.concurrency, queue: QUEUE_NAME }, 'Worker pool starting');

    const workers = Array.from({ length: this.concurrency }, (_, i) => this.workerLoop(i + 1));
    await Promise.all(workers);
  }

  private async workerLoop(workerId: number): Promise<void> {
    const processingList = RedisKeys.waitingList(QUEUE_NAME, 'processing').replace(':waiting:', ':');
    // Build the actual processing list key: queue:pr-reviews:processing
    // WHY manual build: the SDK only exports waitingList, delayedSet, deadList.
    // The processing list key follows the same pattern as the core system.
    const processListKey = `queue:${QUEUE_NAME}:processing`;

    const waitingKeys = PRIORITY_ORDER.map((p) => RedisKeys.waitingList(QUEUE_NAME, p));

    while (this.running) {
      try {
        let jobId: string | null = null;

        // Priority polling: drain high before normal before low
        // RPOPLPUSH atomically moves the job ID to the processing list
        for (const listKey of waitingKeys) {
          jobId = await this.redis.rpoplpush(listKey, processListKey);
          if (jobId) break;
        }

        if (!jobId) {
          // No work available — poll again after short sleep
          if (this.running) await new Promise<void>((r) => setTimeout(r, 100));
          continue;
        }

        this.activeJobs++;
        try {
          await this.handleJob(jobId, workerId, processListKey);
        } finally {
          this.activeJobs--;
        }
      } catch (err) {
        if (this.running) {
          log.error({ workerId, err }, 'Worker loop error');
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  private async handleJob(jobId: string, workerId: number, processListKey: string): Promise<void> {
    // ── 1. Deserialize job from Redis hash ──────────────────────────────────
    const hash = await this.redis.hgetall(RedisKeys.jobHash(jobId));
    if (!hash || Object.keys(hash).length === 0) {
      log.warn({ jobId, workerId }, 'Job hash not found – skipping');
      await this.redis.lrem(processListKey, 1, jobId);
      return;
    }

    const job: Job<PRReviewJob> = {
      id: hash['id'] ?? jobId,
      type: hash['type'] ?? 'pr_review',
      data: JSON.parse(hash['data'] ?? '{}') as PRReviewJob,
      status: 'active',
      priority: (hash['priority'] ?? 'normal') as Job['priority'],
      attempts: parseInt(hash['attempts'] ?? '0', 10),
      maxAttempts: parseInt(hash['maxAttempts'] ?? String(config.QUEUE_MAX_ATTEMPTS), 10),
      createdAt: parseInt(hash['createdAt'] ?? '0', 10),
    };

    // Mark as active
    await this.redis.hset(RedisKeys.jobHash(jobId), 'status', 'active');

    log.info({ jobId, workerId, type: job.type, attempt: job.attempts + 1 }, 'Processing job');

    try {
      // ── 2. Run the actual PR review pipeline ────────────────────────────────
      await processJob(job.data);

      // ── 3. Mark completed ───────────────────────────────────────────────────
      await this.redis.hset(RedisKeys.jobHash(jobId), 'status', 'completed');
      await this.redis.lrem(processListKey, 1, jobId);

      log.info({ jobId, workerId }, 'Job completed and acknowledged');

    } catch (err) {
      log.error({ jobId, workerId, err }, 'Job failed');

      const nextAttempt = job.attempts + 1;

      if (nextAttempt < job.maxAttempts) {
        // ── Retry with exponential backoff ────────────────────────────────────
        const delay = Math.min(30_000, 1000 * Math.pow(2, nextAttempt));
        const pipe = this.redis.pipeline();
        pipe.hmset(RedisKeys.jobHash(jobId), { status: 'delayed', attempts: nextAttempt.toString() });
        pipe.zadd(RedisKeys.delayedSet(QUEUE_NAME), Date.now() + delay, jobId);
        pipe.lrem(processListKey, 1, jobId);
        await pipe.exec();

        log.info({ jobId, attempt: nextAttempt, maxAttempts: job.maxAttempts, delayMs: delay }, 'Job delayed for retry');
      } else {
        // ── Dead-letter ───────────────────────────────────────────────────────
        const pipe = this.redis.pipeline();
        pipe.hmset(RedisKeys.jobHash(jobId), { status: 'dead', attempts: nextAttempt.toString() });
        pipe.lpush(RedisKeys.deadList(QUEUE_NAME), jobId);
        pipe.lrem(processListKey, 1, jobId);
        await pipe.exec();

        log.warn({ jobId, attempts: nextAttempt }, 'Job exhausted retries – moved to dead-letter queue');
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    // Wait for in-flight jobs (up to 30 seconds)
    const deadline = Date.now() + 30_000;
    while (this.activeJobs > 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    await this.redis.quit();
    log.info('Worker pool stopped');
  }
}

// ─── Standalone entrypoint ────────────────────────────────────────────────────
if (require.main === module) {
  const pool = new WorkerPool(config.REDIS_URL, config.QUEUE_CONCURRENCY);

  process.on('SIGTERM', () => void pool.stop());
  process.on('SIGINT', () => void pool.stop());

  pool.start().catch((err: unknown) => {
    log.fatal({ err }, 'Worker pool crashed');
    process.exit(1);
  });
}
