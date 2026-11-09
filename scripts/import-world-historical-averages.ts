/**
 * Fail-closed replacement for the legacy CricketArchive averages importer.
 *
 * The legacy implementation fetches CricketArchive pages and writes player
 * statistics under cricketarchive:* identities. That source path has no
 * documented redistribution license in this repository and conflicts with the
 * current World identity/source policy. This command must not silently create
 * data that could later be mistaken for import-ready World Cup data.
 */
console.error("[WORLD HISTORICAL AVERAGES] BLOCKED: the legacy CricketArchive source path is disabled.");
console.error("[WORLD HISTORICAL AVERAGES] Do not import or publish a readable website's statistics unless the source's reuse terms explicitly permit the intended storage and redistribution.");
console.error("[WORLD HISTORICAL AVERAGES] Use the gated Cricsheet pipeline for eligible editions. Historical editions require a reusable licensed dataset or written permission, plus canonical identity and reviewed-role crosswalks.");
process.exitCode = 2;
