import { neon } from "@neondatabase/serverless";

import {
  executePerceptionLedgerScrub,
  parsePerceptionLedgerScrubArgs,
} from "./lib/perception-ledger-scrub.mjs";

// Explicit post-deploy privacy operation. This file intentionally lives outside
// migrations: migration 0013 must be safe while the previous Runtime image is
// still reading detailed perception from runtime_events.
//
// Dry run:
//   NEON_DATABASE_URL=... node scripts/scrub-perception-ledger.mjs
// Apply, only after the projection-backed Runtime is healthy:
//   NEON_DATABASE_URL=... node scripts/scrub-perception-ledger.mjs --apply

const databaseUrl = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL or NEON_DATABASE_URL is required");
}

await executePerceptionLedgerScrub({
  sql: neon(databaseUrl),
  apply: parsePerceptionLedgerScrubArgs(process.argv.slice(2)).apply,
  write: (message) => console.log(message),
});
