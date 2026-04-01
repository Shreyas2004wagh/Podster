import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectAppEntries,
  createNextTypeStubs,
  toTypeStubPath
} from "./ensure-next-types.mjs";

async function withTempFrontend(callback) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "podster-next-types-"));

  try {
    await callback(tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("collectAppEntries returns Next layout and page entries recursively", async () => {
  await withTempFrontend(async (frontendRoot) => {
    const appRoot = path.join(frontendRoot, "app");
    await fs.mkdir(path.join(appRoot, "sessions", "[sessionId]", "join"), { recursive: true });
    await fs.writeFile(path.join(appRoot, "layout.tsx"), "export default function Layout() { return null; }\n");
    await fs.writeFile(path.join(appRoot, "page.tsx"), "export default function Page() { return null; }\n");
    await fs.writeFile(
      path.join(appRoot, "sessions", "[sessionId]", "join", "page.tsx"),
      "export default function JoinPage() { return null; }\n"
    );
    await fs.writeFile(path.join(appRoot, "sessions", "[sessionId]", "join", "loading.tsx"), "export default function Loading() { return null; }\n");

    const entries = await collectAppEntries(appRoot);
    const relativeEntries = entries.map((entryPath) => path.relative(appRoot, entryPath)).sort();

    assert.deepEqual(relativeEntries, [
      "layout.tsx",
      "page.tsx",
      path.join("sessions", "[sessionId]", "join", "page.tsx")
    ]);
  });
});

test("createNextTypeStubs creates additive placeholder files for app entries", async () => {
  await withTempFrontend(async (frontendRoot) => {
    const appRoot = path.join(frontendRoot, "app");
    const staleTypesRoot = path.join(frontendRoot, ".next", "types", "app", "stale");
    await fs.mkdir(path.join(appRoot, "sessions", "new"), { recursive: true });
    await fs.mkdir(staleTypesRoot, { recursive: true });
    await fs.writeFile(path.join(appRoot, "layout.tsx"), "export default function Layout() { return null; }\n");
    await fs.writeFile(path.join(appRoot, "sessions", "new", "page.tsx"), "export default function NewPage() { return null; }\n");
    await fs.writeFile(path.join(staleTypesRoot, "page.ts"), "export {};\n");

    await createNextTypeStubs(frontendRoot);

    const layoutStubPath = toTypeStubPath({
      appRoot,
      typesRoot: path.join(frontendRoot, ".next", "types", "app"),
      entryPath: path.join(appRoot, "layout.tsx")
    });
    const newPageStubPath = toTypeStubPath({
      appRoot,
      typesRoot: path.join(frontendRoot, ".next", "types", "app"),
      entryPath: path.join(appRoot, "sessions", "new", "page.tsx")
    });

    assert.equal(await fs.readFile(layoutStubPath, "utf8"), "export {};\n");
    assert.equal(await fs.readFile(newPageStubPath, "utf8"), "export {};\n");
    assert.equal(
      await fs.readFile(path.join(staleTypesRoot, "page.ts"), "utf8"),
      "export {};\n"
    );
  });
});
