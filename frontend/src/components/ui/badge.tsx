import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive" | "warning" | "success";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2",
        {
          "border-transparent bg-[#111] text-white": variant === "default",
          "border-transparent bg-gray-100 text-gray-900": variant === "secondary",
          "border-transparent bg-red-100 text-red-800": variant === "destructive",
          "border-transparent bg-amber-100 text-amber-800": variant === "warning",
          "border-transparent bg-emerald-100 text-emerald-800": variant === "success",
          "text-gray-950 border-gray-200": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
