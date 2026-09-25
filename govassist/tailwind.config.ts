import type { Config } from "tailwindcss";

// ---------------------------------------------------------------------------
// GovAssist design tokens
//
// Palette rationale (see /docs/design-notes.md for the full writeup):
// - "paper"   – warm, slightly grey off-white. Not a cream/yellow background;
//               meant to read like good ledger/form paper, not a marketing site.
// - "ink"     – near-black navy-charcoal used for all body text.
// - "brand"   – deep institutional indigo-navy. This is the dominant color:
//               headers, primary buttons, active nav state, links.
// - "accent"  – muted marigold/ochre. Used SPARINGLY: deadline callouts,
//               a single highlighted stat, the onboarding progress fill.
// - "eligible"/"caution"/"ineligible" – status colors for exam eligibility,
//               deliberately desaturated so a screen full of cards doesn't
//               look like a traffic-light dashboard.
// ---------------------------------------------------------------------------

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#F7F6F2",
          raised: "#FFFFFF",
          sunk: "#EFEDE5",
        },
        ink: {
          DEFAULT: "#14181F",
          muted: "#4B5563",
          faint: "#8A8F98",
        },
        brand: {
          50: "#EEF2F7",
          100: "#D8E1EC",
          300: "#7C97B4",
          500: "#2C4A6E",
          600: "#1F3A5F",
          700: "#152A47",
          900: "#0D1B30",
        },
        accent: {
          100: "#F6E7CF",
          400: "#D89A44",
          500: "#C97D2C",
          600: "#A9631E",
        },
        eligible: {
          bg: "#E9F1EC",
          fg: "#2F6B4F",
          line: "#2F6B4F",
        },
        caution: {
          bg: "#FBF0DE",
          fg: "#8A5A16",
          line: "#C97D2C",
        },
        ineligible: {
          bg: "#F6E9E7",
          fg: "#A63D2F",
          line: "#A63D2F",
        },
        hairline: "#DAD5C8",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 24, 31, 0.06)",
        raised: "0 4px 16px rgba(20, 24, 31, 0.10)",
      },
      maxWidth: {
        app: "480px",
      },
    },
  },
  plugins: [],
};

export default config;
