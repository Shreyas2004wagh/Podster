import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ENTRY_NAMES = new Set(["layout.ts", "layout.tsx", "page.ts", "page.tsx"]);

export async function collectAppEntries(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectAppEntries(fullPath)));
      continue;
    }

    if (APP_ENTRY_NAMES.has(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

export function toTypeStubPath({ appRoot, typesRoot, entryPath }) {
  const relativeEntryPath = path.relative(appRoot, entryPath);
  return path.join(typesRoot, relativeEntryPath).replace(/\.(tsx|ts)$/, ".ts");
}

export async function ensureStubTypeFile({ appRoot, typesRoot, entryPath }) {
  const targetPath = toTypeStubPath({ appRoot, typesRoot, entryPath });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.access(targetPath);
    return targetPath;
  } catch {
    await fs.writeFile(targetPath, "export {};\n", "utf8");
    return targetPath;
  }
}

export async function createNextTypeStubs(frontendRoot) {
  const appRoot = path.join(frontendRoot, "app");
  const nextTypesRoot = path.join(frontendRoot, ".next", "types");
  const appTypesRoot = path.join(nextTypesRoot, "app");
  const appEntries = await collectAppEntries(appRoot);

  await fs.mkdir(nextTypesRoot, { recursive: true });
  await fs.mkdir(appTypesRoot, { recursive: true });
  await fs.writeFile(path.join(nextTypesRoot, "package.json"), '{ "type": "module" }\n', "utf8");

  const sortedEntries = [...appEntries].sort((left, right) => left.localeCompare(right));
  for (const entryPath of sortedEntries) {
    await ensureStubTypeFile({
      appRoot,
      typesRoot: appTypesRoot,
      entryPath
    });
  }
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const frontendRoot = path.resolve(__dirname, "..");
  await createNextTypeStubs(frontendRoot);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
