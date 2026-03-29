import { expect, test } from "@playwright/test";

function buildSession(id: string, title: string, hostId: string) {
  const timestamp = new Date("2026-03-20T00:00:00.000Z").toISOString();
  return {
    id,
    title,
    status: "draft",
    hostId,
    createdAt: timestamp,
    updatedAt: timestamp,
    tracks: []
  };
}

function seedViewer(sessionId: string, viewer: { sessionId: string; userId: string; role: "host" | "guest"; name: string }) {
  return {
    key: `podster.viewer.${sessionId}`,
    value: viewer
  };
}

function seedChunk(sessionId: string, userId: string) {
  return { sessionId, userId };
}

function seedNote(sessionId: string, userId: string, notes: string) {
  return {
    key: `podster.notes.${sessionId}.${userId}`,
    value: notes
  };
}

test("host can create a session and reach the recording room", async ({ page }) => {
  await page.route("**/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        session: buildSession("session-host", "Demo episode", "host-1"),
        viewer: {
          sessionId: "session-host",
          userId: "host-1",
          role: "host",
          name: "Host"
        }
      })
    });
  });

  await page.goto("/sessions/new");
  await page.getByLabel("Session title").fill("Demo episode");
  await page.getByRole("button", { name: /create and enter room/i }).click();

  await page.waitForURL(/\/sessions\/session-host\/record$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /start session and record/i })).toBeVisible();
  await expect(page.getByText(/only the host can start the session/i)).toHaveCount(0);
});

test("guest can record locally without seeing the host start control path", async ({ page }) => {
  const sessionId = "session-guest";
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, seedViewer(sessionId, {
    sessionId,
    userId: "guest-1",
    role: "guest",
    name: "Guest"
  }));

  await page.goto(`/sessions/${sessionId}/record`);

  await expect(page.getByRole("button", { name: /start local recording/i })).toBeEnabled();
  await expect(page.getByRole("button", { name: /upload chunks/i })).toBeDisabled();
  await expect(page.getByText(/only the host can start the session live/i)).toBeVisible();
});

test("guest can join a session and land in the recording room", async ({ page }) => {
  await page.route("**/sessions/demo-session/join", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        viewer: {
          sessionId: "demo-session",
          userId: "guest-2",
          role: "guest",
          name: "Guest 2"
        }
      })
    });
  });

  await page.goto("/sessions/demo-session/join");
  await page.getByLabel("Display name").fill("Guest 2");
  await page.getByRole("button", { name: /join recording room/i }).click();

  await page.waitForURL(/\/sessions\/demo-session\/record$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /start local recording/i })).toBeEnabled();
});

test("host notes persist into the recording room and survive a reload", async ({ page }) => {
  await page.route("**/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        session: buildSession("session-notes", "Notes episode", "host-1"),
        viewer: {
          sessionId: "session-notes",
          userId: "host-1",
          role: "host",
          name: "Host"
        }
      })
    });
  });

  await page.goto("/sessions/new");
  await page.getByLabel("Session title").fill("Notes episode");
  await page.getByLabel("Notes (local only)").fill("Intro beats\nSponsor read");
  await page.getByRole("button", { name: /create and enter room/i }).click();

  await page.waitForURL(/\/sessions\/session-notes\/record$/, { timeout: 15_000 });
  await expect(page.getByLabel("Local notes")).toHaveValue("Intro beats\nSponsor read");

  await page.reload();
  await expect(page.getByLabel("Local notes")).toHaveValue("Intro beats\nSponsor read");
});

test("local notes stay scoped to the active viewer", async ({ page }) => {
  const sessionId = "session-scoped-notes";

  await page.addInitScript(({ viewer, hostNote }) => {
    window.localStorage.setItem(viewer.key, JSON.stringify(viewer.value));
    window.localStorage.setItem(hostNote.key, JSON.stringify(hostNote.value));
  }, {
    viewer: seedViewer(sessionId, {
      sessionId,
      userId: "guest-1",
      role: "guest",
      name: "Guest"
    }),
    hostNote: seedNote(sessionId, "host-1", "Host-only notes")
  });

  await page.goto(`/sessions/${sessionId}/record`);

  await expect(page.getByLabel("Local notes")).toHaveValue("");
  await page.getByLabel("Local notes").fill("Guest notes");

  await expect(
    page.evaluate(({ guestKey, hostKey }) => ({
      guest: window.localStorage.getItem(guestKey),
      host: window.localStorage.getItem(hostKey)
    }), {
      guestKey: seedNote(sessionId, "guest-1", "").key,
      hostKey: seedNote(sessionId, "host-1", "").key
    })
  ).resolves.toEqual({
    guest: JSON.stringify("Guest notes"),
    host: JSON.stringify("Host-only notes")
  });
});

test("saved local chunks block starting a fresh take after a reload", async ({ page }) => {
  const sessionId = "session-recovery";
  await page.addInitScript(({ viewer, chunk }) => {
    window.localStorage.setItem(viewer.key, JSON.stringify(viewer.value));

    const request = indexedDB.open("podster-recordings", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("chunks")) {
        db.createObjectStore("chunks", { keyPath: ["sessionId", "userId", "partNumber"] });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("chunks", "readwrite");
      tx.objectStore("chunks").put({
        sessionId: chunk.sessionId,
        userId: chunk.userId,
        partNumber: 1,
        blob: new Blob(["saved"], { type: "video/webm" }),
        createdAt: Date.now()
      });
    };
  }, {
    viewer: seedViewer(sessionId, {
      sessionId,
      userId: "host-1",
      role: "host",
      name: "Host"
    }),
    chunk: seedChunk(sessionId, "host-1")
  });

  await page.goto(`/sessions/${sessionId}/record`);

  await expect(page.getByRole("button", { name: /start session and record/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /upload chunks/i })).toBeEnabled();
  await expect(page.getByText(/recorded chunks were found locally/i)).toBeVisible();
  await expect(page.getByText(/previous take is still saved in this browser/i)).toBeVisible();
});

test("invalid stored viewer state is discarded before entering the recording flow", async ({ page }) => {
  const sessionId = "session-invalid";
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: `podster.viewer.${sessionId}`,
    value: {
      sessionId: "another-session",
      userId: 42,
      role: "admin",
      name: ""
    }
  });

  await page.goto(`/sessions/${sessionId}/record`);

  await expect(page.getByText(/participant identity is missing in this browser/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start local recording/i })).toBeDisabled();
  await expect(
    page.evaluate((storageKey) => window.localStorage.getItem(storageKey), `podster.viewer.${sessionId}`)
  ).resolves.toBeNull();
});
