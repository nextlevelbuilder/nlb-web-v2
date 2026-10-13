import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Constellation design system.
 * Colours are HSL triplets defined as CSS variables in app/globals.css (:root = light "star atlas",
 * .dark = "deep space observatory"), so every token supports opacity modifiers (e.g. bg-primary/10).
 * The shadcn names (background, primary, muted, ...) are kept so existing components keep working;
 * the Constellation names (ink, line, surface, cta, canvas) describe the editorial palette directly.
 */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn-compatible semantic tokens
        background: token("background"),
        foreground: token("foreground"),
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        success: token("success"),
        warning: token("warning"),
        chart: {
          "1": token("chart-1"),
          "2": token("chart-2"),
          "3": token("chart-3"),
          "4": token("chart-4"),
          "5": token("chart-5"),
        },
        // Constellation editorial tokens
        canvas: { DEFAULT: token("background"), deep: token("canvas-deep") },
        ink: { DEFAULT: token("foreground"), 2: token("ink-2"), 3: token("muted-foreground") },
        line: { DEFAULT: token("border"), strong: token("line-strong") },
        surface: { DEFAULT: token("card"), raised: token("surface-raised") },
        star: token("primary"),
        cta: { DEFAULT: token("cta"), foreground: token("cta-foreground"), hover: token("cta-hover") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "Iowan Old Style", "Times New Roman", "serif"],
        heading: ["var(--font-display)", "Iowan Old Style", "Times New Roman", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Constellation fluid type scale
        "step-xs": ["0.6875rem", { lineHeight: "1.5", letterSpacing: "0.08em" }],
        "step-sm": ["0.8125rem", { lineHeight: "1.55" }],
        "step-base": ["1rem", { lineHeight: "1.6" }],
        "step-md": ["1.0625rem", { lineHeight: "1.6" }],
        "step-lg": ["clamp(1.125rem, 1.02rem + 0.35vw, 1.3rem)", { lineHeight: "1.55" }],
        "step-xl": ["clamp(1.4rem, 1.15rem + 0.9vw, 1.9rem)", { lineHeight: "1.2" }],
        "step-2xl": ["clamp(1.9rem, 1.35rem + 2vw, 3rem)", { lineHeight: "1.08" }],
        "step-3xl": ["clamp(2.2rem, 1.4rem + 3.4vw, 4.75rem)", { lineHeight: "1.04", letterSpacing: "-0.012em" }],
        "step-4xl": ["clamp(2.5rem, 1.2rem + 5.6vw, 7.25rem)", { lineHeight: "1", letterSpacing: "-0.02em" }],
        // Legacy names kept for existing pages (mapped onto the Constellation rhythm)
        "display-2xl": ["clamp(2.5rem, 1.6rem + 4vw, 4.5rem)", { lineHeight: "1.02", fontWeight: "400", letterSpacing: "-0.02em" }],
        "display-xl": ["clamp(2.25rem, 1.5rem + 3.2vw, 3.75rem)", { lineHeight: "1.05", fontWeight: "400", letterSpacing: "-0.02em" }],
        "display-lg": ["clamp(2rem, 1.4rem + 2.4vw, 3rem)", { lineHeight: "1.1", fontWeight: "400", letterSpacing: "-0.01em" }],
        hero: ["clamp(2.5rem, 1.6rem + 4vw, 4rem)", { lineHeight: "1.05", fontWeight: "400", letterSpacing: "-0.02em" }],
        h1: ["clamp(2rem, 1.4rem + 2.4vw, 3rem)", { lineHeight: "1.1", fontWeight: "400", letterSpacing: "-0.01em" }],
        h2: ["clamp(1.75rem, 1.3rem + 1.8vw, 2.5rem)", { lineHeight: "1.15", fontWeight: "500", letterSpacing: "-0.01em" }],
        h3: ["clamp(1.5rem, 1.2rem + 1.2vw, 2rem)", { lineHeight: "1.2", fontWeight: "500" }],
        h4: ["1.5rem", { lineHeight: "1.3", fontWeight: "500" }],
        h5: ["1.25rem", { lineHeight: "1.4", fontWeight: "500" }],
        "body-lg": ["1.125rem", { lineHeight: "1.7", fontWeight: "400" }],
        body: ["1rem", { lineHeight: "1.7", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.6", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }],
      },
      spacing: {
        header: "var(--header-h)",
        gutter: "var(--gutter)",
        section: "clamp(6rem, 12vw, 10rem)",
        "section-sm": "clamp(4rem, 8vw, 5rem)",
        "section-lg": "clamp(7rem, 14vw, 10rem)",
        "section-xl": "clamp(8rem, 16vw, 12.5rem)",
        "13": "3.25rem",
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
        "36": "9rem",
        "42": "10.5rem",
      },
      maxWidth: {
        wrap: "var(--wrap)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 1px)",
        sm: "var(--radius-sm)",
        pill: "999px",
      },
      boxShadow: {
        constellation: "var(--shadow)",
        glow: "0 0 0 6px hsl(var(--cta) / 0.18), 0 10px 40px -8px var(--glow)",
        // Legacy names kept for existing pages
        "premium-sm": "var(--shadow)",
        premium: "var(--shadow)",
        "premium-lg": "var(--shadow)",
        "premium-xl": "var(--shadow)",
        "glow-primary": "0 0 40px -10px var(--glow)",
        "glow-primary-lg": "0 0 80px -20px var(--glow)",
        "inner-highlight": "inset 0 1px 0 0 hsl(var(--foreground) / 0.05)",
      },
      transitionTimingFunction: {
        expo: "cubic-bezier(0.16, 1, 0.3, 1)",
        quart: "cubic-bezier(0.25, 1, 0.5, 1)",
        premium: "cubic-bezier(0.16, 1, 0.3, 1)",
        "premium-in": "cubic-bezier(0.7, 0, 0.84, 0)",
        "premium-bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "260ms",
        slow: "600ms",
        slower: "1000ms",
        "250": "250ms",
        "350": "350ms",
        "400": "400ms",
        "600": "600ms",
        "800": "800ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "none" },
        },
        "ping-soft": {
          "0%": { transform: "scale(0.4)", opacity: "1" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        cue: {
          "0%": { transform: "scaleY(0)", opacity: "1" },
          "60%": { transform: "scaleY(1)", opacity: "1" },
          "100%": { transform: "scaleY(1)", opacity: "0" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        rise: "rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        "ping-soft": "ping-soft 2.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        cue: "cue 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        twinkle: "twinkle 3.2s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
