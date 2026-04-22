import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/20 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border text-muted-foreground",
        // Trading variants (migrated from common/Badge)
        success: "border-transparent bg-bull/20 text-bull",
        warning: "border-transparent bg-warning/20 text-warning",
        danger: "border-transparent bg-bear/20 text-bear",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps 
  extends React.HTMLAttributes<HTMLSpanElement>, 
    VariantProps<typeof badgeVariants> {
  /** Show animated pulse indicator */
  pulse?: boolean;
}

function Badge({ className, variant, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse && (
        <span 
          className={cn(
            'w-1.5 h-1.5 rounded-full live-pulse',
            variant === 'success' ? 'bg-bull' : 
            variant === 'danger' ? 'bg-bear' : 
            variant === 'warning' ? 'bg-warning' :
            'bg-primary'
          )} 
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
