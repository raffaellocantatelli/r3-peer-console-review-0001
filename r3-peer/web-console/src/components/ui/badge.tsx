import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        fatto: "bg-ink text-paper",
        inferenza: "bg-paper-2 text-foreground shadow-[0_0_0_1px_rgba(28,24,20,0.14)]",
        simulazione: "bg-paper-3 text-ink shadow-[0_0_0_1px_rgba(28,24,20,0.14)]",
        ok: "bg-ok/15 text-ok",
        error: "bg-seal/12 text-seal",
        mute: "bg-paper-2 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "mute" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
