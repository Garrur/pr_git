import Fastify from 'fastify';
import Redis from 'ioredis';
import pino from 'pino';
import { Queue } from 'distri-task-sdk';
import { config } from './config/validateEnv';
import { registerWebhookRoutes } from './webhook/receiver';
import type { PRReviewJob } from './types';

/**
 * Application entrypoint.
 *
 * Separation of concerns:
 *  - This file owns the HTTP server lifecycle
 *  - Queue publishing uses distri-task-sdk's Queue class
 *  - The worker (src/worker/index.ts) runs in a separate process
 */

const QUEUE_NAME = 'pr-reviews';

// Standalone logger for events that fire before/outside the Fastify app instance
const log = pino({ level: config.LOG_LEVEL, name: 'server' });

async function main(): Promise<void> {
  // ── Redis connection ────────────────────────────────────────────────────────
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  redis.on('error', (err: Error) => {
    // WHY only log and not exit: ioredis handles reconnection internally.
    // Exiting on every transient error would cause churn in containerised envs.
    log.error({ err }, 'Redis connection error');
  });

  // ── distri-task-sdk Queue producer ──────────────────────────────────────────
  // WHY: The SDK persists the full Job hash and pushes the ID to the correct
  // priority waiting list. The Distri core worker picks up from the same keys.
  const queue = new Queue(redis, QUEUE_NAME);

  // ── Fastify ─────────────────────────────────────────────────────────────────
  const loggerOptions =
    process.env['NODE_ENV'] !== 'production'
      ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty', options: { colorize: true } } }
      : { level: config.LOG_LEVEL };

  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
  });

  // ── Enqueue helper using distri-task-sdk ───────────────────────────────────
  async function enqueueJob(job: PRReviewJob): Promise<void> {
    await queue.enqueue<PRReviewJob>('pr_review', job, {
      priority: 'normal',
      maxAttempts: config.QUEUE_MAX_ATTEMPTS,
    });
  }

  await registerWebhookRoutes(app, enqueueJob);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down server');
    await app.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── Start listening ───────────────────────────────────────────────────────
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info({ port: config.PORT, baseUrl: config.BASE_URL }, 'PR Pilot webhook server running');
}

main().catch((err: unknown) => {
  console.error('[fatal] Server failed to start:', err);
  process.exit(1);
});
