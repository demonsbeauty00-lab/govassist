#!/usr/bin/env node
// Verifies the environment is configured before you try to run the app
// against a real Supabase project. Run with: npm run check-env

const required = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", hint: "Project Settings → API → Project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", hint: "Project Settings → API → anon public key" },
];

const optional = [
  { key: "SUPABASE_SERVICE_ROLE_KEY", hint: "Project Settings → API → service_role key (server-only, needed for seeding exam data and the source-monitoring pipeline)" },
  { key: "CRON_SECRET", hint: "A random secret you choose (e.g. `openssl rand -hex 32`) — required for the /api/cron/check-sources endpoint to accept requests" },
  { key: "NEXT_PUBLIC_SITE_URL", hint: "Your deployed origin, e.g. https://govassist.app (used to build auth email redirect links)" },
];

// Loads .env.local by hand (no dotenv dependency) so this script has zero deps.
const fs = require("fs");
const path = require("path");
const envPath = path.join(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
} else {
  console.log("⚠️  No .env.local found. Copy .env.example to .env.local and fill in your Supabase credentials.\n");
}

let ok = true;

console.log("Required:");
for (const { key, hint } of required) {
  const present = !!process.env[key];
  console.log(`  ${present ? "✓" : "✗"} ${key}${present ? "" : `  — ${hint}`}`);
  if (!present) ok = false;
}

console.log("\nOptional (needed for some flows):");
for (const { key, hint } of optional) {
  const present = !!process.env[key];
  console.log(`  ${present ? "✓" : "·"} ${key}${present ? "" : `  — ${hint}`}`);
}

console.log("\n" + (ok ? "✅ Required config present — npm run dev should be able to reach Supabase." : "❌ Missing required config — the app will show a ConfigError screen until this is fixed."));

process.exit(ok ? 0 : 1);
