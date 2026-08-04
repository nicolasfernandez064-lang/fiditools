import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-xl border border-white/[0.10] bg-slate-950/[0.65] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/[0.70] focus:ring-2 focus:ring-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
