import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldAlert, Zap, FileCode2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CodeSnippet } from "@/components/ui/code-snippet";

export default function PRDetail({ params }: { params: { id: string } }) {
  // Mock data for the view
  const files = [
    { name: "src/auth.ts", issues: 1, type: "security" },
    { name: "src/db/queries.ts", issues: 1, type: "performance" },
    { name: "src/components/layout.tsx", issues: 0, type: "none" },
  ];

  return (
    <div className="flex flex-col h-full max-w-6xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/dashboard/prs" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            Refactor user authentication flow
            <Badge variant="warning">Changes Requested</Badge>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)] font-mono">
            acme/api#1024
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 items-start mt-4">
        {/* Left Pane: Files */}
        <div className="lg:col-span-1 rounded-xl border bg-white shadow-card overflow-hidden dark:bg-[#0F0F10]">
          <div className="border-b bg-gray-50/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] dark:bg-[#151515]">
            Files Changed
          </div>
          <div className="divide-y">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer dark:hover:bg-[#151515]">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileCode2 className="size-4 shrink-0 text-gray-400" />
                  <span className="truncate text-sm font-medium">{f.name}</span>
                </div>
                {f.issues > 0 && (
                  <Badge variant={f.type === "security" ? "destructive" : "warning"} className="ml-2 px-1.5 py-0">
                    {f.issues}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Pane: AI Comments */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Card className="p-0 border-red-200 dark:border-red-900/50">
            <div className="border-b border-red-100 bg-red-50/50 px-6 py-4 flex items-center gap-3 dark:bg-red-950/20 dark:border-red-900/30">
              <ShieldAlert className="size-5 text-red-600 dark:text-red-400" />
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-300">Security Vulnerability</h3>
                <p className="text-xs text-red-700/80 font-mono mt-0.5 dark:text-red-400/80">src/auth.ts:24</p>
              </div>
            </div>
            <div className="p-6">
              <CodeSnippet 
                className="mb-4 text-xs lg:text-sm"
                code={`- const secret = process.env.SECRET || "dev-secret"\n+ const secret = requireEnv("SECRET")`} 
              />
              <p className="text-sm leading-relaxed text-[var(--color-foreground)]">
                Hardcoding fallback secrets poses a critical security risk. It is highly recommended to enforce strict environment variable validation at runtime to prevent accidental exposure in production.
              </p>
            </div>
          </Card>

          <Card className="p-0 border-amber-200 dark:border-amber-900/50">
            <div className="border-b border-amber-100 bg-amber-50/50 px-6 py-4 flex items-center gap-3 dark:bg-amber-950/20 dark:border-amber-900/30">
              <Zap className="size-5 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-300">N+1 Query Detection</h3>
                <p className="text-xs text-amber-700/80 font-mono mt-0.5 dark:text-amber-400/80">src/db/queries.ts:112</p>
              </div>
            </div>
            <div className="p-6">
              <CodeSnippet 
                className="mb-4 text-xs lg:text-sm"
                code={`- const users = await db.query('SELECT * FROM users');\n- for (const user of users) {\n-   user.profile = await db.query('SELECT * FROM profiles WHERE user_id = ?', [user.id]);\n- }`} 
              />
              <p className="text-sm leading-relaxed text-[var(--color-foreground)]">
                This loop performs a query for every user, creating an N+1 performance bottleneck. Consider using a `JOIN` to fetch users and profiles in a single query.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
