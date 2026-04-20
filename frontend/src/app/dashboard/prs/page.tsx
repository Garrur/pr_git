import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

const prs = [
  { id: "1024", title: "Refactor user authentication flow", repo: "acme/api", status: "changes_requested", time: "2 hours ago" },
  { id: "1023", title: "Add default sorting to search endpoint", repo: "acme/api", status: "approved", time: "5 hours ago" },
  { id: "1022", title: "Update README with setup instructions", repo: "acme/docs", status: "approved", time: "1 day ago" },
  { id: "1021", title: "Fix memory leak in background worker", repo: "acme/worker", status: "changes_requested", time: "2 days ago" },
];

export default function PRList() {
  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pull Requests</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Recent PRs reviewed by Pilot across all repositories.
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border bg-white shadow-card dark:bg-[#0F0F10]">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50/50 text-[var(--color-muted)] dark:bg-[#151515]">
            <tr>
              <th className="px-6 py-4 font-medium">Pull Request</th>
              <th className="px-6 py-4 font-medium">Repository</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Reviewed</th>
              <th className="px-6 py-4 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prs.map((pr) => (
              <tr key={pr.id} className="group hover:bg-gray-50/50 transition-colors dark:hover:bg-[#151515]">
                <td className="px-6 py-4 font-medium text-[var(--color-foreground)]">
                  <Link href={`/dashboard/prs/${pr.id}`} className="hover:underline">
                    {pr.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-[var(--color-muted)] font-mono text-xs">{pr.repo}</td>
                <td className="px-6 py-4">
                  <Badge variant={pr.status === "approved" ? "success" : "warning"}>
                    {pr.status === "approved" ? "Approved" : "Changes Requested"}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-[var(--color-muted)]">{pr.time}</td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/dashboard/prs/${pr.id}`}>
                    <ChevronRight className="inline-block size-4 text-[var(--color-muted)] group-hover:text-[var(--color-foreground)] transition-colors" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
