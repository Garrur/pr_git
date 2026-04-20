import Link from "next/link";
import { LayoutDashboard, GitPullRequest, Settings, LayoutList } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-[#FAFAFA] dark:bg-[#0F0F10]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-white dark:bg-[#0F0F10] sm:flex">
        <div className="flex h-14 items-center border-b px-6 font-semibold">
          <GitPullRequest className="mr-2 size-5" />
          <span>PR Pilot</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 transition-colors dark:bg-gray-800 dark:text-gray-50"
          >
            <LayoutDashboard className="size-4" />
            Overview
          </Link>
          <Link
            href="/dashboard/prs"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <LayoutList className="size-4" />
            PR Reviews
          </Link>
          <Link
            href="#"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
          >
            <Settings className="size-4" />
            Settings
          </Link>
        </nav>
        <div className="border-t p-4 text-xs text-gray-500 dark:text-gray-400">
          User Account
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col sm:pl-64">
        {/* Sticky Top Nav */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-white/70 px-6 backdrop-blur-md dark:bg-[#0F0F10]/70">
          <div className="flex-1 text-sm font-medium text-[var(--color-muted)]">
            /dashboard
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
