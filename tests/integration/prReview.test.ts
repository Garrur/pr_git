/**
 * Integration test – full PR review pipeline.
 *
 * Uses:
 *  - Testcontainers (real Redis) for queue verification
 *  - nock to intercept GitHub API calls
 *  - nock to intercept Anthropic API calls
 *  - Fastify test instance for webhook endpoint
 *
 * WHY real Redis (not mock): the BRPOPLPUSH reliable-queue pattern depends on
 * specific Redis command semantics that an in-memory mock cannot faithfully
 * reproduce.
 */

import crypto from 'crypto';
import Fastify from 'fastify';
import Redis from 'ioredis';
import nock from 'nock';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { FastifyInstance } from 'fastify';
import type { PRReviewJob } from '../../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSignature(body: string | Buffer, secret: string): string {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? Buffer.from(body) : body)
    .digest('hex');
  return `sha256=${hmac}`;
}

const WEBHOOK_SECRET = 'test-webhook-secret-minimum-16-chars';
const QUEUE_NAME = 'pr-reviews';

const PR_OPENED_PAYLOAD = {
  action: 'opened',
  number: 42,
  pull_request: {
    id: 1001,
    number: 42,
    title: 'Add feature X',
    body: 'This PR adds feature X',
    state: 'open',
    draft: false,
    head: { sha: 'abc123def456', ref: 'feature/x' },
    base: { sha: 'main000000', ref: 'main' },
    user: { login: 'dev', id: 9999 },
    additions: 50,
    deletions: 5,
    changed_files: 3,
  },
  repository: {
    id: 2001,
    full_name: 'org/myrepo',
    owner: { login: 'org' },
    name: 'myrepo',
    private: false,
    default_branch: 'main',
  },
  installation: { id: 777 },
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('PR Review Integration', () => {
  let redisContainer: StartedTestContainer;
  let redis: Redis;
  let app: FastifyInstance;
  let enqueueJob: (job: PRReviewJob) => Promise<void>;
  let redisUrl: string;

  beforeAll(async () => {
    // Start a real Redis container
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const host = redisContainer.getHost();
    const port = redisContainer.getMappedPort(6379);
    redisUrl = `redis://${host}:${port}`;

    redis = new Redis(redisUrl);

    // Disable all real HTTP requests during tests
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(async () => {
    nock.enableNetConnect();
    await redis.quit();
    await redisContainer.stop();
  });

  beforeEach(async () => {
    await redis.flushall();
    nock.cleanAll();

    // Build a minimal Fastify instance per test
    app = Fastify({ logger: false });

    // Override REDIS_URL for this test to use the container
    process.env['REDIS_URL'] = redisUrl;

    // Use distri-task-sdk Queue for enqueuing — same as production code
    const { Queue } = await import('distri-task-sdk');
    const queue = new Queue(redis, QUEUE_NAME);

    enqueueJob = async (job: PRReviewJob) => {
      await queue.enqueue<PRReviewJob>('pr_review', job, {
        priority: 'normal',
        maxAttempts: 3,
      });
    };

    const { registerWebhookRoutes } = await import('../../src/webhook/receiver');
    await registerWebhookRoutes(app, enqueueJob);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    jest.resetModules();
  });

  // ── Test 1: Invalid signature → 401 ────────────────────────────────────────
  it('rejects a webhook with an invalid signature', async () => {
    const body = JSON.stringify(PR_OPENED_PAYLOAD);

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=badhex000000000000000000000000000000000000000000000000000000000000',
      },
      body,
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'Invalid signature' });
  });

  // ── Test 2: Valid webhook → 200 + job enqueued via distri-task-sdk ──────────
  it('accepts a valid webhook and enqueues a job via distri-task-sdk', async () => {
    const body = JSON.stringify(PR_OPENED_PAYLOAD);
    const sig = makeSignature(body, WEBHOOK_SECRET);

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': sig,
      },
      body,
    });

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { status: string; jobId: string };
    expect(parsed.status).toBe('queued');
    expect(parsed.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Verify job landed in distri-task-sdk's waiting list
    const { RedisKeys } = await import('distri-task-sdk');
    const waitingListKey = RedisKeys.waitingList(QUEUE_NAME, 'normal');
    const queueLength = await redis.llen(waitingListKey);
    expect(queueLength).toBe(1);

    // Verify the job hash was persisted by the SDK
    const jobIdInList = await redis.lindex(waitingListKey, 0);
    expect(jobIdInList).not.toBeNull();

    const jobHash = await redis.hgetall(RedisKeys.jobHash(jobIdInList!));
    expect(jobHash['type']).toBe('pr_review');
    expect(jobHash['status']).toBe('waiting');
    expect(jobHash['priority']).toBe('normal');

    // Verify the job data contains our PR info
    const jobData = JSON.parse(jobHash['data']!) as PRReviewJob;
    expect(jobData.prNumber).toBe(42);
    expect(jobData.owner).toBe('org');
    expect(jobData.repo).toBe('myrepo');
    expect(jobData.installationId).toBe(777);
  });

  // ── Test 3: Draft PR → ignored (not enqueued) ───────────────────────────────
  it('ignores draft pull requests', async () => {
    const draftPayload = {
      ...PR_OPENED_PAYLOAD,
      pull_request: { ...PR_OPENED_PAYLOAD.pull_request, draft: true },
    };
    const body = JSON.stringify(draftPayload);
    const sig = makeSignature(body, WEBHOOK_SECRET);

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': sig,
      },
      body,
    });

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { status: string; reason: string };
    expect(parsed.status).toBe('ignored');
    expect(parsed.reason).toBe('draft PR');

    const waitingKey = `queue:${QUEUE_NAME}:waiting:normal`;
    const queueLength = await redis.llen(waitingKey);
    expect(queueLength).toBe(0);
  });

  // ── Test 4: Non-PR event → ignored ──────────────────────────────────────────
  it('ignores non pull_request events', async () => {
    const pushPayload = { ref: 'refs/heads/main', commits: [] };
    const body = JSON.stringify(pushPayload);
    const sig = makeSignature(body, WEBHOOK_SECRET);

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': sig,
      },
      body,
    });

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { status: string };
    expect(parsed.status).toBe('ignored');

    const waitingKey = `queue:${QUEUE_NAME}:waiting:normal`;
    const queueLength = await redis.llen(waitingKey);
    expect(queueLength).toBe(0);
  });

  // ── Test 5: Closed action → ignored (not enqueued) ──────────────────────────
  it('ignores closed PR actions', async () => {
    const closedPayload = { ...PR_OPENED_PAYLOAD, action: 'closed' };
    const body = JSON.stringify(closedPayload);
    const sig = makeSignature(body, WEBHOOK_SECRET);

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': sig,
      },
      body,
    });

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { status: string; reason: string };
    expect(parsed.status).toBe('ignored');
    expect(parsed.reason).toContain('closed');

    expect(await redis.llen(`queue:${QUEUE_NAME}:waiting:normal`)).toBe(0);
  });

  // ── Test 6: Health endpoint ──────────────────────────────────────────────────
  it('returns 200 on /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { status: string };
    expect(parsed.status).toBe('ok');
  });
});

// ─── LLM Structured Output Tests ─────────────────────────────────────────────

describe('LLM structured output parsing', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.resetModules();
  });

  it('parses valid JSON array from Claude response', async () => {
    const mockComments = [
      {
        path: 'src/auth.ts',
        line: 5,
        side: 'RIGHT',
        body: 'Consider using constant-time comparison to prevent timing attacks.',
        severity: 'security',
      },
    ];

    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(mockComments) }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    const { reviewChunks } = await import('../../src/llm/reviewer');
    const review = await reviewChunks([
      { files: [{ path: 'src/auth.ts', content: '+  return compare(a, b);' }] },
    ]);

    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]!.severity).toBe('security');
    expect(review.event).toBe('REQUEST_CHANGES'); // security → REQUEST_CHANGES
  });

  it('returns APPROVE verdict when no issues found', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_test2',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '[]' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 5 },
      });

    const { reviewChunks } = await import('../../src/llm/reviewer');
    const review = await reviewChunks([
      { files: [{ path: 'src/clean.ts', content: '+const x = 1;' }] },
    ]);

    expect(review.event).toBe('APPROVE');
    expect(review.comments).toHaveLength(0);
  });

  it('returns COMMENT verdict for performance issues', async () => {
    const mockComments = [
      {
        path: 'src/db.ts',
        line: 10,
        side: 'RIGHT',
        body: 'N+1 query detected in this loop.',
        severity: 'performance',
      },
    ];

    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_test3',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(mockComments) }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 80, output_tokens: 30 },
      });

    const { reviewChunks } = await import('../../src/llm/reviewer');
    const review = await reviewChunks([
      { files: [{ path: 'src/db.ts', content: '+  for (const id of ids) await db.find(id);' }] },
    ]);

    expect(review.event).toBe('COMMENT');
  });

  it('handles malformed JSON gracefully and returns empty comments', async () => {
    // Both the first call and retry return invalid JSON
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .times(2) // first call + retry
      .reply(200, {
        id: 'msg_bad',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is not JSON at all' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 10 },
      });

    const { reviewChunks } = await import('../../src/llm/reviewer');

    // Should not throw – graceful fallback to empty comments
    const review = await reviewChunks([
      { files: [{ path: 'src/bad.ts', content: '+const x = 1;' }] },
    ]);

    expect(review.comments).toHaveLength(0);
    expect(review.event).toBe('APPROVE');
  });
});

// ─── GitHub Review Post Tests ─────────────────────────────────────────────────

describe('GitHub review posting', () => {
  afterEach(() => {
    jest.resetModules();
  });

  /**
   * WHY mock Octokit directly: @octokit/request v20+ uses native fetch
   * which nock cannot intercept. Mocking the method directly tests our
   * postReview logic (filtering, batching, error handling) without HTTP.
   */
  function makeMockOctokit(createReviewImpl?: (...args: unknown[]) => Promise<unknown>) {
    return {
      pulls: {
        createReview: jest.fn(createReviewImpl ?? (async () => ({ data: { id: 99 } }))),
      },
    } as unknown as import('@octokit/rest').Octokit;
  }

  it('posts review exactly once via createReview()', async () => {
    const { postReview, buildValidLineMap } = await import('../../src/github/commenter');
    const { parseDiff } = await import('../../src/github/diffParser');

    const octokit = makeMockOctokit();

    const diff = `diff --git a/src/auth.ts b/src/auth.ts
index 000..001 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
 import x from 'x';
+const secret = process.env.SECRET;
 export function foo() {}
`;

    const files = parseDiff(diff);
    const validLines = buildValidLineMap(files);

    await postReview(octokit, 'org', 'myrepo', 42, 'abc123', {
      event: 'REQUEST_CHANGES',
      body: '🔴 Security issue found.',
      comments: [
        { path: 'src/auth.ts', line: 2, side: 'RIGHT', body: 'Avoid hardcoding secrets.', severity: 'security' },
      ],
    }, validLines);

    // Verify createReview was called exactly once
    expect(octokit.pulls.createReview).toHaveBeenCalledTimes(1);

    const call = (octokit.pulls.createReview as unknown as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(call['owner']).toBe('org');
    expect(call['repo']).toBe('myrepo');
    expect(call['pull_number']).toBe(42);
    expect(call['event']).toBe('REQUEST_CHANGES');
    expect((call['comments'] as Array<Record<string, unknown>>).length).toBe(1);
  });

  it('drops comments with invalid line numbers', async () => {
    const { postReview, buildValidLineMap } = await import('../../src/github/commenter');
    const { parseDiff } = await import('../../src/github/diffParser');

    const octokit = makeMockOctokit();

    const diff = `diff --git a/src/x.ts b/src/x.ts
index 000..001 100644
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

    const files = parseDiff(diff);
    const validLines = buildValidLineMap(files);

    await postReview(octokit, 'org', 'myrepo', 42, 'abc123', {
      event: 'COMMENT',
      body: 'Review note.',
      comments: [
        // Valid: line 2 exists in new file
        { path: 'src/x.ts', line: 2, side: 'RIGHT', body: 'Valid comment', severity: 'style' },
        // Invalid: line 9999 does not exist
        { path: 'src/x.ts', line: 9999, side: 'RIGHT', body: 'Bad comment', severity: 'bug' },
      ],
    }, validLines);

    const call = (octokit.pulls.createReview as unknown as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    const comments = call['comments'] as Array<{ line: number }>;
    expect(comments).toHaveLength(1);
    expect(comments[0]!.line).toBe(2);
  });

  it('retries on 403 rate limit', async () => {
    const { postReview } = await import('../../src/github/commenter');

    let callCount = 0;
    const octokit = makeMockOctokit(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('rate limited') as Error & { status: number; response: { headers: Record<string, string> } };
        err.status = 403;
        err.response = { headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1) } };
        throw err;
      }
      return { data: { id: 100 } };
    });

    // Should succeed after retry (rate limit wait is ~1s in this test)
    await postReview(octokit, 'org', 'myrepo', 42, 'abc123', {
      event: 'APPROVE',
      body: 'LGTM',
      comments: [],
    }, new Map());

    expect(callCount).toBe(2);
  });
});

