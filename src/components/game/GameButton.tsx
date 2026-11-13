import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const gameButton = cva(
  "relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-display font-bold uppercase tracking-wider transition-all duration-200 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-gradient-primary text-primary-foreground shadow-glow hover:-translate-y-0.5 hover:brightness-110",
        hot: "bg-gradient-hot text-accent-foreground shadow-hot hover:-translate-y-0.5 hover:brightness-110",
        gold: "bg-gradient-gold text-gold-foreground hover:-translate-y-0.5 hover:brightness-110",
        glass: "glass text-foreground hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
      },
      size: {
        sm: "h-9 rounded-lg px-3 text-sm",
        md: "h-11 rounded-xl px-5 text-base",
        lg: "h-14 rounded-2xl px-8 text-xl",
        xl: "h-16 rounded-2xl px-10 text-2xl sm:h-20 sm:px-14 sm:text-3xl",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface GameButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof gameButton> {
  asChild?: boolean;
  shine?: boolean;
}

export const GameButton = React.forwardRef<HTMLButtonElement, GameButtonProps>(
  ({ className, variant, size, asChild, shine, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(gameButton({ variant, size }), className)} {...props}>
        {asChild ? children : (
          <>
            {shine && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-foreground/25" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
GameButton.displayName = "GameButton";
