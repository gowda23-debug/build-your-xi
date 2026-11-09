/** Historical processing is intentionally blocked until a reusable source license is documented. */
console.error("[WORLD HISTORICAL PROCESSING] BLOCKED: the legacy historical scorecard input has no documented reusable license in this repository and its player-role/source identity mappings are not production-ready.");
console.error("[WORLD HISTORICAL PROCESSING] No historical files were written. Use the gated Cricsheet pipeline for supported editions; do not publish 1975–1999 until complete source coverage, canonical identities, explicit role evidence, and source permission are established.");
process.exitCode = 2;
