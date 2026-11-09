/**
 * Fail-closed replacement for automatic bulk downloading of historical
 * ESPNcricinfo archive scorecards.
 *
 * Public readability is not evidence that an archive grants bulk scraping,
 * storage, derivative-database, or redistribution rights. The old downloader
 * is retained as a command name so existing package scripts fail clearly
 * instead of making silent copies of an unlicensed source.
 */
console.error("[WORLD HISTORICAL DOWNLOAD] BLOCKED: automatic bulk download of the ESPNcricinfo historical archive has been disabled pending documented reuse rights.");
console.error("[WORLD HISTORICAL DOWNLOAD] Cricsheet covers only a subset of men's World Cup matches and does not supply the 1975–1999 editions. Do not fill these gaps with guessed data or a 'Public-Archive' label.");
console.error("[WORLD HISTORICAL DOWNLOAD] Resume historical ingestion only after selecting a source whose terms expressly permit the intended use, then implement and validate a source-specific adapter.");
process.exitCode = 2;
