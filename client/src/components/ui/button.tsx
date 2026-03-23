import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-all duration-200 select-none outline-none focus:ring-[3px] focus:ring-[#4a90e2]/20 focus:ring-offset-0 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[#4a90e2] text-white hover:bg-[#5ba3f5] hover:shadow-[0_4px_6px_rgba(0,0,0,0.4)] focus:ring-white/35 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.35)]",
        secondary:
          "border border-[#404040] bg-[#191b1f] text-[#e5e5e5] hover:border-[#4a90e2] hover:bg-[#1c1e22] focus:border-[#4a90e2] focus:bg-[#1c1e22]",
        ghost: "bg-[#191b1f] text-[#e5e5e5] shadow-none hover:bg-[#1c1e22] focus:bg-[#1c1e22]",
        icon:
          "bg-[#191b1f] text-[#e5e5e5] hover:bg-[#1c1e22] hover:text-[#4a90e2] focus:bg-[#1c1e22] focus:text-[#4a90e2]",
      },
      size: {
        default: "h-10 px-5",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }