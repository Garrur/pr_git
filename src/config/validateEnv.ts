import { z } from 'zod';

/**
 * Single source of truth for all environment configuration.
 * Fails fast at startup to prevent misconfigured deployments from running silently.
 *
 * WHY: process.env access is untyped and can return undefined at any call site.
 * Centralising validation here means the rest of the codebase gets typed primitives.
 */

const envSchema = z.object({
  // ── GitHub App ──────────────────────────────────────────────────────────────
  GITHUB_APP_ID: z
    .string()
    .min(1)
    .transform((v) => parseInt(v, 10))
    .refine((n) => !Number.isNaN(n) && n > 0, 'GITHUB_APP_ID must be a positive integer'),

  GITHUB_PRIVATE_KEY: z
    .string()
    .min(1)
    // Allow both literal \n (stored in .env) and real newlines
    .transform((v) => v.replace(/\\n/g, '\n')),

  GITHUB_WEBHOOK_SECRET: z.string().min(16, 'Webhook secret must be ≥ 16 characters'),

  // ── LLM ─────────────────────────────────────────────────────────────────────
  GROQ_API_KEY: z.string().min(1),

  LLM_MODEL: z.string().default('llama3-70b-8192'),

  // ── Queue ───────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL (e.g. redis://localhost:6379)'),

  QUEUE_CONCURRENCY: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= 1 && n <= 20, 'QUEUE_CONCURRENCY must be between 1 and 20'),

  QUEUE_MAX_ATTEMPTS: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= 1, 'QUEUE_MAX_ATTEMPTS must be ≥ 1'),

  // ── Server ──────────────────────────────────────────────────────────────────
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n > 0 && n < 65536, 'PORT must be a valid TCP port'),

  BASE_URL: z.string().url('BASE_URL must be a valid URL'),

  // ── Optional ────────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    // Die immediately – a misconfigured app should never serve traffic
    console.error(`[config] Environment validation failed:\n${issues}`);
    process.exit(1);
  }

  return result.data;
}

/** Validated, typed configuration. Import this instead of process.env. */
export const config: Config = loadConfig();
