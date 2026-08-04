import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/[0.20] hover:-translate-y-0.5 hover:shadow-xl",
        secondary: "border border-white/[0.10] bg-white/[0.08] text-slate-100 hover:bg-white/[0.12]",
        outline: "border border-slate-700 bg-slate-950/[0.40] text-slate-100 hover:border-violet-400/[0.60] hover:bg-violet-500/[0.10]",
        ghost: "text-slate-300 hover:bg-white/[0.08] hover:text-white",
        danger: "bg-red-500/[0.15] text-red-200 hover:bg-red-500/[0.25]"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "size-10"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
