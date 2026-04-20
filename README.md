# PR Pilot
“AI code reviews that catch real issues — not noise.”

---

## 🚀 Overview
PR Pilot is a high-performance GitHub App designed to automate deep code reviews. Unlike traditional linters that focus on syntax, PR Pilot leverages Large Language Models (LLMs) to identify logic bugs, security vulnerabilities, and performance bottlenecks. By offloading review cycles to an asynchronous worker pool, it provides near-instant feedback to developers without blocking human review or exceeding GitHub’s webhook timeout constraints.

---

## ⚡ Key Highlights
- **Asynchronous Architecture:** Decouples webhook receipt from LLM processing using a robust Queue-Worker pattern.
- **Webhook Resiliency:** Responds to GitHub events in milliseconds, moving heavy AI analysis to background workers to stay well under the 10s timeout.
- **Engineered Prompting:** Enforces structured JSON output from LLMs to ensure consistent, machine-readable review comments.
- **Rate-Limit Management:** Implements intelligent batching of review comments using the GitHub Checks and Pull Request Review APIs.
- **Scalable Worker Pool:** Powered by `distri-task-sdk` and Redis, allowing for horizontal scaling of review capacity.
- **Full Test Coverage:** Comprehensive suite including unit tests and integration tests with Redis via Testcontainers and API mocking via Nock.

---

## 🏗️ Architecture

### Pipeline Flow:
`Webhook Receipt` → `Job Enqueueing` → `Worker Pickup` → `LLM Analysis` → `GitHub Review Posting`

### System Diagram:
```text
  GitHub         Webhook Server        Redis Queue         Worker Pool
  Events            (Fastify)         (BullMQ/Distri)       (Node.js)
    │                  │                   │                    │
    ├─ Webhook ───────>┤                   │                    │
    │  (PR Open/Sync)  │                   │                    │
    │                  ├─ Enqueue Job ────>┤                    │
    │<── 200 OK ───────┤                   │                    │
    │                  │                   ├─ Pick Up Job ─────>┤
    │                  │                   │                    │
    │                  │                   │            ┌───────┴───────┐
    │                  │                   │            │   LLM Engine  │
    │                  │                   │            │ (Groq / Llama)│
    │                  │                   │            └───────┬───────┘
    │                  │                   │                    │
    │<── Post Review ──┴───────────────────┴────────────────────┤
    │  (Batch Comments)                                         │
```

### Key Components:
- **Webhook Receiver:** Fastify-based entry point that validates signatures and secures the pipeline.
- **Queue System:** Distributed task management using Redis to handle spikes in PR activity.
- **Worker Pool:** Specialized background processes focused on diff parsing and AI orchestration.
- **LLM Engine:** Multi-provider support (Groq/Anthropic) with specialized chunking for large diffs.
- **GitHub Client:** Custom Octokit integration optimized for bulk comment posting.

---

## 🧠 Key Engineering Decisions

- **Async Processing:** GitHub requires webhook responses within 10 seconds. Since LLM inference often exceeds this, we moved the analysis to a Redis-backed queue to ensure 100% delivery reliability.
- **Diff Chunking:** To handle massive Pull Requests that exceed LLM context windows, diffs are semantically chunked before analysis and re-aggregated during the review phase.
- **Batch Reviewing:** posting individual comments triggers excessive notifications and hits rate limits. We aggregate all AI findings into a single `PR_REVIEW` event with a summary verdict.
- **JSON Enforcement:** We use schema-strict prompting to force LLMs to return pure JSON, ensuring our parser never breaks on conversational "noise" from the model.

---

## 📊 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Backend** | TypeScript + Fastify |
| **Queue** | distri-task-sdk + Redis |
| **LLM Engine** | Groq (Llama 3 70B) |
| **GitHub API** | Octokit |
| **Testing** | Jest + Testcontainers + Nock |

---

## 📁 Project Structure

```text
src/
├── config/       # Environment & schema validation (Zod)
├── github/       # Diff parsing and Octokit API orchestration
├── llm/          # Prompt engineering and LLM client management
├── webhook/      # Fastify routes and signature verification
├── worker/       # Background job consumers
└── types/        # Unified type definitions
tests/            # Unit & Integration suites
```

---

## ⚙️ Setup Instructions

### 1. Prerequisites
- Node.js v18+
- Redis (Local or Docker)
- GitHub App credentials

### 2. Installation
```bash
git clone https://github.com/Garrur/pr_git.git
npm install
```

### 3. Configuration
Duplicate `.env.example` as `.env` and provide:
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- `GROQ_API_KEY`
- `REDIS_URL`

### 4. Running the System
```bash
# Start Webhook Server
npm run dev

# Start Worker Pool
npm run worker
```

---

## 🧪 Testing
The system utilizes a "Real-World Mocking" strategy:
- **Integration Tests:** Use `Testcontainers` to spin up a live Redis instance.
- **API Mocks:** `Nock` captures and validates all outgoing GitHub and LLM traffic.

```bash
npm test
```

---

## 🚀 What Makes This Project Strong
PR Pilot is not a "wrapper script." It is a production-hardened system that addresses real-world constraints:
- **Distributed Thinking:** Built to handle high-concurrency environments through a decoupled architecture.
- **Resiliency:** Handles transient network failures and LLM downtime via built-in retry logic in the queue system.
- **Data Integrity:** Strict validation at the edge (webhooks) and the core (LLM responses) ensures the system is type-safe and reliable.

---

## 📌 Future Improvements
- **Cross-File Context:** Implementing vector embeddings to allow the AI to understand how a PR affects the wider codebase.
- **Multi-LLM Fallback:** Automatic failover between Groq, OpenAI, and Anthropic for 99.9% availability.
- **Cost Analytics:** Tracking token usage per PR to optimize inference spend.
- **Feedback Loop:** Allowing developers to "thumbs up/down" AI comments to fine-tune the system's accuracy.
