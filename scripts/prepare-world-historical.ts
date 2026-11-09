/** Historical ingestion is intentionally blocked until a reusable source license is documented. */
console.error("[WORLD HISTORICAL PREPARE] BLOCKED: this legacy parser converts cached ESPNcricinfo archive pages into a local stats database without a documented reuse grant in this repository.");
console.error("[WORLD HISTORICAL PREPARE] Do not parse or persist the archive as a production source. Add a source adapter only after its terms permit the intended storage and redistribution, then validate identities and stats against source scorecards.");
process.exitCode = 2;
