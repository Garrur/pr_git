import * as React from "react"
import { cn } from "@/lib/utils"

export interface CodeSnippetProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
}

const CodeSnippet = React.forwardRef<HTMLPreElement, CodeSnippetProps>(
  ({ className, code, ...props }, ref) => {
    return (
      <pre
        ref={ref}
        className={cn(
          "overflow-x-auto rounded-lg border border-[var(--color-border)] bg-gray-50/50 p-4 text-sm font-mono text-gray-800 dark:bg-gray-900/50 dark:text-gray-300",
          className
        )}
        {...props}
      >
        <code>{code}</code>
      </pre>
    )
  }
)
CodeSnippet.displayName = "CodeSnippet"

export { CodeSnippet }
