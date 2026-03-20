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
