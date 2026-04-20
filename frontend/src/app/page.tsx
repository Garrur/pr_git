import Link from "next/link";
import { ArrowRight, CheckCircle2, GitPullRequest, Code2, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      {/* Navbar Minimal */}
      <header className="sticky top-0 z-50 w-full border-b border-transparent glass transition-all duration-200">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <GitPullRequest className="size-5" />
            <span>PR Pilot</span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="#features" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
              How it works
            </Link>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Button size="sm">Install App</Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* 1. Hero Section */}
        <section className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:pt-48 md:pb-32">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-8 items-center">
            <div className="flex flex-col items-start gap-8">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl text-[var(--color-foreground)]">
                AI code reviews that actually catch real issues
              </h1>
              <p className="text-lg leading-relaxed text-[var(--color-muted)] sm:text-xl max-w-xl">
                PR Pilot reviews pull requests with production-level intelligence — focusing on bugs, security, and performance. No noise.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-4 w-full">
                <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base shadow-soft">
                  Install GitHub App
                </Button>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
                    View Demo
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Product Preview Mockup */}
            <div className="relative rounded-2xl border bg-white shadow-soft dark:bg-gray-950 overflow-hidden transform transition-transform hover:-translate-y-1 duration-300">
              <div className="border-b bg-gray-50/50 px-4 py-3 flex items-center gap-2 dark:bg-gray-900/50">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-red-400" />
                  <div className="size-3 rounded-full bg-amber-400" />
                  <div className="size-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 text-xs font-mono text-gray-500">github.com/org/repo/pull/42</div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-md bg-red-100 p-2 dark:bg-red-900/30">
                    <ShieldAlert className="size-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">Security Vulnerability</h3>
                    <p className="text-xs text-[var(--color-muted)]">src/auth.ts:24</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  <span className="text-red-500">- const secret = process.env.SECRET || "dev-secret"</span>
                  <br />
                  <span className="text-emerald-500">+ const secret = requireEnv("SECRET")</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  Hardcoding fallback secrets poses a critical security risk. It's recommended to enforce strict environment variable validation at runtime.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Trust Section */}
        <section id="features" className="border-t bg-gray-50/50 dark:bg-gray-900/20">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
            <div className="mb-16">
              <h2 className="text-3xl font-semibold tracking-tight">Built for developers, not demos</h2>
            </div>
            <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: ShieldAlert,
                  title: "Finds real bugs",
                  description: "Ignores style issues and formatting. Targets race conditions, memory leaks, and security flaws.",
                },
                {
                  icon: Code2,
                  title: "Inline PR comments",
                  description: "Posts directly to the affected lines in your GitHub diff, just like a human reviewer would.",
                },
                {
                  icon: Zap,
                  title: "Async processing",
                  description: "Reliable background queuing handles massive monorepos and sudden surges in PR volume.",
                },
                {
                  icon: GitPullRequest,
                  title: "Works with any repo",
                  description: "Installs in seconds. Zero configuration files or workflow scripts required to get started.",
                },
              ].map((feature, i) => (
                <div key={i} className="flex flex-col gap-4">
                  <div className="size-10 rounded-lg border bg-white flex items-center justify-center shadow-sm dark:bg-gray-950">
                    <feature.icon className="size-5 text-[var(--color-foreground)]" />
                  </div>
                  <h3 className="font-semibold text-[var(--color-foreground)]">{feature.title}</h3>
                  <p className="text-sm text-[var(--color-muted)] leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. How It Works */}
        <section id="how-it-works" className="border-t">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
            <h2 className="text-3xl font-semibold tracking-tight mb-16">How it works</h2>
            
            <div className="relative">
              {/* Connector line */}
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[var(--color-border)] -translate-y-1/2 hidden md:block" />
              
              <div className="grid gap-12 md:grid-cols-4 md:gap-8 text-center relative z-10">
                {[
                  { step: "1", title: "PR Opened", desc: "You push code and open a Pull Request" },
                  { step: "2", title: "Webhook", desc: "Secure webhook instantly triggers our queue" },
                  { step: "3", title: "AI Review", desc: "Claude Sonnet analyzes the diff concurrently" },
                  { step: "4", title: "Comments", desc: "High-signal issues posted directly to GitHub" },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-4 bg-[var(--color-background)]">
                    <div className="flex size-12 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-background)] font-mono text-sm font-semibold text-[var(--color-foreground)] shadow-sm">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold">{item.title}</h4>
                      <p className="mt-2 text-sm text-[var(--color-muted)] max-w-[200px] mx-auto">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Developer Credibility */}
        <section className="border-t bg-[#0f0f10] text-[#fafafa]">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-8">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Engineered for reliability.</h2>
                <p className="mt-6 max-w-xl text-lg text-gray-400">
                  Reviewing code requires deterministic performance. PR Pilot is built on a fault-tolerant architecture using the Reliable Queue Pattern.
                </p>
              </div>
              <div className="flex flex-col gap-8 lg:mt-0">
                {[
                  "Distributed worker architecture built on Redis",
                  "Guaranteed exactly-once execution (BRPOPLPUSH)",
                  "Automatic exponential backoff and rate-limit handling",
                  "Concurrent chunk analysis for massive pull requests"
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <CheckCircle2 className="size-6 text-gray-500 shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 6. CTA Section */}
        <section className="border-t">
          <div className="mx-auto max-w-4xl px-6 py-32 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-[var(--color-foreground)]">
              Start reviewing PRs smarter
            </h2>
            <p className="mt-6 text-lg text-[var(--color-muted)]">
              Join engineering teams writing higher quality code with less effort.
            </p>
            <div className="mt-10">
              <Button size="lg" className="h-12 px-8 text-base shadow-soft">
                Install GitHub App
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-6 px-6 py-8 text-sm text-[var(--color-muted)]">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
            <GitPullRequest className="size-4" />
            <span>PR Pilot</span>
          </div>
          <div className="flex gap-6">
            <span className="hover:text-[var(--color-foreground)] cursor-pointer">Documentation</span>
            <span className="hover:text-[var(--color-foreground)] cursor-pointer">GitHub</span>
            <span className="hover:text-[var(--color-foreground)] cursor-pointer">Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
