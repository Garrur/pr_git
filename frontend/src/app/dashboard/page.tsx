import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Bug, Clock } from "lucide-react";

export default function DashboardOverview() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        High-level metrics for your automated PR reviews.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PRs Reviewed</CardTitle>
            <Activity className="size-4 text-[var(--color-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,248</div>
            <p className="text-xs text-[var(--color-muted)] mt-1">+12% from last month</p>
          </CardContent>
        </Card>

        {/* Metric 2 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Issues Found</CardTitle>
            <Bug className="size-4 text-[var(--color-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">432</div>
            <p className="text-xs text-[var(--color-muted)] mt-1">Primarily in src/auth.ts</p>
          </CardContent>
        </Card>

        {/* Metric 3 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Review Time</CardTitle>
            <Clock className="size-4 text-[var(--color-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.2s</div>
            <p className="text-xs text-[var(--color-muted)] mt-1">Per 100 lines of diff</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
