# PR Pilot — GitHub App for automated PR review

## Quick Start

```bash
cp .env.example .env
# fill in .env values
npm install
npm run dev          # webhook server (port 3000)
npm run worker       # worker process (separate terminal)
```

## Running Tests

```bash
# Unit tests only (fast, no Docker required)
npm run test:unit

# Integration tests (requires Docker for Redis testcontainer)
npm run test:integration

# All tests
npm test
```

## Architecture

```
GitHub Webhook → POST /webhook
  → verify HMAC-SHA256
  → enqueue PRReviewJob to Redis list

Worker (BRPOPLPUSH reliable queue):
  → fetch PR diff (Octokit)
  → parse + filter diff (diffParser)
  → chunk for LLM (chunkForLLM)
  → concurrent LLM review (Claude, concurrency=3)
  → post single batch review (octokit.pulls.createReview)
```

## Environment Variables

See `.env.example` for all required and optional variables.

## Process Model

Run as two separate processes:
- **Webhook server**: `npm run dev` — receives GitHub webhooks, enqueues jobs
- **Worker**: `npm run worker` — processes jobs from queue, calls LLM, posts review

Scale workers horizontally by running multiple worker instances against the same Redis.
