import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const IPL_JSON_URL =
  "https://cricsheet.org/downloads/ipl_json.zip";

const RAW_DATA_DIR = path.join(
  process.cwd(),
  "scripts",
  "data",
  "raw"
);

const OUTPUT_FILE = path.join(
  RAW_DATA_DIR,
  "ipl_json.zip"
);

async function downloadIPLData() {
  console.log("Downloading IPL JSON data from Cricsheet...");

  await mkdir(RAW_DATA_DIR, {
    recursive: true,
  });

  const response = await fetch(IPL_JSON_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to download IPL data: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.arrayBuffer();

  await writeFile(
    OUTPUT_FILE,
    Buffer.from(data)
  );

  console.log("IPL data downloaded successfully.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
}

downloadIPLData().catch((error) => {
  console.error("Download failed:");
  console.error(error);

  process.exit(1);
});