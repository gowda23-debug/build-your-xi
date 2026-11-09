import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Build Your XI — gated World Cup data pipeline.
 *
 * Default mode is dry-run. Live database writes require an explicit --import.
 * This pipeline intentionally covers only the six configured Cricsheet men's
 * ODI World Cup editions. It never treats a public ESPN archive as an open
 * redistribution license and never synthesizes IDs or guesses player roles.
 *
 * Usage:
 *   npm.cmd run data:pipeline-world
 *   npm.cmd run data:pipeline-world -- --skip-download
 *   npm.cmd run data:pipeline-world -- --import
 */

const ROOT = process.cwd();
const TSX_ARGS = ["--import", "tsx"] as const;

type PipelineOptions = {
  importToDatabase: boolean;
  skipDownload: boolean;
};

function fail(message: string): never {
  throw new Error(`[WORLD PIPELINE] ${message}`);
}

function parseArgs(args: string[]): PipelineOptions {
  const supported = new Set(["--import", "--skip-download"]);
  const unknown = args.filter((arg) => !supported.has(arg));
  if (unknown.length > 0) {
    fail(`Unsupported argument(s): ${unknown.join(", ")}. Supported arguments: --import, --skip-download.`);
  }
  return {
    importToDatabase: args.includes("--import"),
    skipDownload: args.includes("--skip-download"),
  };
}

function runScript(scriptName: string, args: string[] = []): void {
  const scriptPath = path.join(ROOT, "scripts", scriptName);
  console.log(`\n[WORLD PIPELINE] >>> ${scriptName}${args.length ? ` ${args.join(" ")}` : ""}`);

  const result = spawnSync(
    process.execPath,
    [...TSX_ARGS, scriptPath, ...args],
    {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.error) {
    fail(`Could not execute ${scriptName}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${scriptName} exited with status ${String(result.status)}. Pipeline stopped; no later stage was run.`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  console.log("[WORLD PIPELINE] Starting gated men's ODI World Cup pipeline.");
  console.log(`[WORLD PIPELINE] Mode: ${options.importToDatabase ? "LIVE IMPORT REQUESTED" : "DRY RUN — no database writes"}`);

  if (!options.skipDownload) {
    runScript("download-world-data.ts");
  } else {
    console.log("[WORLD PIPELINE] Skipping download because --skip-download was provided.");
  }

  // This stage does not alter processed output or Supabase. It blocks before
  // the processing script can quarantine old processed files when no complete
  // source edition also has all roles explicitly verified.
  runScript("audit-world-import-readiness.ts", ["--source-only"]);

  // The existing processor quarantines stale processed files before rebuilding.
  // It is only run after the source+role preflight above passes.
  runScript("process-world-data.ts");

  // Full audit validates processed metadata, IDs, statistics, role provenance,
  // and exact source/processed player-set parity.
  runScript("audit-world-import-readiness.ts");

  // Importer validates every selected edition before any database write.
  runScript("import-world-data.ts", ["--all-ready", "--dry-run"]);

  if (options.importToDatabase) {
    runScript("import-world-data.ts", ["--all-ready"]);
    console.log("[WORLD PIPELINE] Live import finished for editions that passed all source, role, data, and database checks.");
  } else {
    console.log("[WORLD PIPELINE] Dry run finished. Supabase was not changed.");
    console.log("[WORLD PIPELINE] To publish only the editions validated above, run: npm.cmd run data:pipeline-world -- --import");
  }

  console.log("[WORLD PIPELINE] Completed.");
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD PIPELINE] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
