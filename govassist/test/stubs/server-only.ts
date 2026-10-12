// Test-only stand-in for the `server-only` package, wired up in
// vitest.config.ts. The real package deliberately throws when imported
// outside a React Server Component build, which is exactly what protects
// production code from leaking into client bundles — but Vitest runs plain
// Node, not a Server Component build, so the real one would throw on every
// test that touches a server-only module. Production code still imports the
// REAL `server-only`; this stub is never used by `next build`/`next dev`.
export {};
