import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const appRoot = path.join(frontendRoot, "app");
const typesRoot = path.join(frontendRoot, ".next", "types", "app");

const appEntryNames = new Set(["layout.ts", "layout.tsx", "page.ts", "page.tsx"]);

async function collectAppEntries(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectAppEntries(fullPath)));
      continue;
    }

    if (appEntryNames.has(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function ensureStubTypeFile(entryPath) {
  const relativeEntryPath = path.relative(appRoot, entryPath);
  const targetPath = path.join(typesRoot, relativeEntryPath).replace(/\.(tsx|ts)$/, ".ts");

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.access(targetPath);
    return;
  } catch {
    // File is missing; create a minimal placeholder so tsc can resolve the include.
  }

  await fs.writeFile(targetPath, "export {};\n", "utf8");
}

async function main() {
  const appEntries = await collectAppEntries(appRoot);

  await fs.mkdir(path.join(frontendRoot, ".next", "types"), { recursive: true });
  await fs.rm(typesRoot, { recursive: true, force: true });
  await fs.mkdir(typesRoot, { recursive: true });
  await fs.writeFile(
    path.join(frontendRoot, ".next", "types", "package.json"),
    '{ "type": "module" }\n',
    "utf8"
  );

  await Promise.all(appEntries.map((entryPath) => ensureStubTypeFile(entryPath)));
}

await main();
