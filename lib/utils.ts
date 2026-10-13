import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only knows the default font-size scale, so it would read custom sizes such as
 * `text-step-base` as text colours and drop a real colour like `text-cta-foreground`.
 * Keep this list in sync with `theme.extend.fontSize` in tailwind.config.ts.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["step-xs", "step-sm", "step-base", "step-md", "step-lg", "step-xl", "step-2xl", "step-3xl", "step-4xl", "display-2xl", "display-xl", "display-lg", "hero", "h1", "h2", "h3", "h4", "h5", "body-lg", "body", "body-sm", "caption"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}
