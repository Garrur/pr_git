import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWebhookSignature } from './verify';
import { config } from '../config/validateEnv';
import type { PullRequestEvent } from '../types';
import type { PRReviewJob } from '../types';
import crypto from 'crypto';

/**
 * Registers the GitHub webhook receiver on the Fastify instance.
 *
 * CRITICAL: rawBody must be captured BEFORE json parsing.
 * Fastify's content-type parser consumes the stream; if we read
 * the parsed body instead, the HMAC will never match GitHub's signature.
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  enqueueJob: (job: PRReviewJob) => Promise<void>,
): Promise<void> {
  // Store the raw buffer on the request object for signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body: Buffer) => void) => {
      done(null, body);
    },
  );

  app.post('/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawBody = req.body as Buffer;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const eventType = req.headers['x-github-event'] as string | undefined;

    // ── 1. Signature verification ─────────────────────────────────────────────
    if (!verifyWebhookSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
      req.log.warn({ signature }, 'Invalid webhook signature – rejecting');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // ── 2. Parse payload ──────────────────────────────────────────────────────
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as unknown;
    } catch {
      return reply.status(400).send({ error: 'Malformed JSON payload' });
    }

    // ── 3. Filter to actionable PR events ────────────────────────────────────
    if (eventType !== 'pull_request') {
      // GitHub sends many event types; silently ACK non-PR events
      return reply.status(200).send({ status: 'ignored', reason: 'not a pull_request event' });
    }

    const event = payload as PullRequestEvent;
    const actionable: PullRequestEvent['action'][] = ['opened', 'synchronize', 'reopened'];

    if (!actionable.includes(event.action)) {
      return reply.status(200).send({ status: 'ignored', reason: `action=${event.action}` });
    }

    // Skip draft PRs – they are not ready for review
    if (event.pull_request.draft) {
      return reply.status(200).send({ status: 'ignored', reason: 'draft PR' });
    }

    // ── 4. Enqueue review job ─────────────────────────────────────────────────
    const job: PRReviewJob = {
      jobId: crypto.randomUUID(),
      installationId: event.installation.id,
      owner: event.repository.owner.login,
      repo: event.repository.name,
      prNumber: event.pull_request.number,
      headSha: event.pull_request.head.sha,
      enqueuedAt: new Date().toISOString(),
    };

    try {
      await enqueueJob(job);
      req.log.info({ jobId: job.jobId, pr: job.prNumber }, 'PR review job enqueued');
    } catch (err) {
      // WHY: return 500 so GitHub retries the webhook delivery
      req.log.error({ err, jobId: job.jobId }, 'Failed to enqueue job');
      return reply.status(500).send({ error: 'Failed to enqueue review job' });
    }

    // GitHub requires a 200 within 10 seconds; actual review is async
    return reply.status(200).send({ status: 'queued', jobId: job.jobId });
  });

  // Health check for load balancer / uptime monitoring
  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({ status: 'ok', ts: Date.now() });
  });
}
