import { expect, test } from "@playwright/test";

import { allSupportedContentFixture } from "../fixtures/all-supported-content";

type DocumentResponse = {
  data: {
    id: string;
    title: string;
    currentVersion: number;
  };
};

test("creates, renames, autosaves, and restores My Draft", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("BranchWrite");
  await expect(
    page.getByRole("heading", { name: "Start with your own words." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New document" }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "My Draft" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Proposal Workspace" }),
  ).toBeVisible();
  await expect(page.getByText("No Alternative selected")).toBeVisible();
  await expect(page.getByText("Demo mode")).toBeVisible();

  const editor = page.getByRole("textbox", { name: "My Draft editor" });
  await editor.click();
  await page.keyboard.type("A saved paragraph.");
  await expect(page.locator(".save-status:visible")).toHaveText(
    "Unsaved changes",
  );
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });

  await page.getByRole("button", { name: "Rename" }).click();
  const titleInput = page.getByLabel("Document title");
  await titleInput.fill("Milestone One Essay");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Milestone One Essay" }),
  ).toBeVisible();

  await page.reload();
  await expect(editor).toContainText("A saved paragraph.");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await editor.click();
  await page.evaluate(() => {
    const target = document.querySelector(
      '[contenteditable="true"][aria-label="My Draft editor"]',
    );
    if (!target) {
      throw new Error("Draft editor not found.");
    }
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/html",
      '<table><tr><td>Table text</td></tr></table><p style="color:red"><u>Simplified paste</u></p><img src="invalid.png">',
    );
    clipboardData.setData("text/plain", "Table text\n\nSimplified paste");
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  await expect(
    page.getByText("Some pasted formatting was simplified."),
  ).toBeVisible();
  await expect(page.locator(".draft-editor-content img")).toHaveCount(0);
  await expect(page.locator(".draft-editor-content table")).toHaveCount(0);
  await expect(page.locator(".save-status:visible")).toHaveText(
    "Unsaved changes",
  );
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
});

test("all supported structure and marks survive save and refresh", async ({
  page,
  request,
}) => {
  const createdResponse = await request.post("/api/documents", {
    data: { title: "Formatting round trip" },
  });
  expect(createdResponse.ok()).toBe(true);
  const created = (await createdResponse.json()) as DocumentResponse;

  const saveResponse = await request.put(
    `/api/documents/${created.data.id}/content`,
    {
      data: {
        content: allSupportedContentFixture,
        expectedVersion: created.data.currentVersion,
      },
    },
  );
  expect(saveResponse.ok()).toBe(true);

  await page.goto(`/documents/${created.data.id}`);
  const draft = page.locator(".draft-editor-content");
  await expect(draft.locator("h1")).toHaveText("A supported document");
  await expect(draft.locator("h2")).toHaveText("Formatting");
  await expect(draft.locator("h3")).toHaveText("Marks");
  await expect(draft.locator("strong")).toHaveText("bold");
  await expect(draft.locator("em")).toHaveText("italic");
  await expect(
    draft.locator('a[href="https://example.com/reference"]'),
  ).toHaveText("linked");
  await expect(draft.locator("ul")).toBeVisible();
  await expect(draft.locator('ol[start="3"]')).toBeVisible();
  await expect(draft.locator("blockquote")).toBeVisible();

  await page.reload();
  await expect(draft.locator("strong")).toHaveText("bold");
  await expect(draft.locator("blockquote")).toContainText(
    "A supported quotation block.",
  );
});

test("a failed save preserves edits and blocks document switching", async ({
  page,
  request,
}) => {
  const firstResponse = await request.post("/api/documents", {
    data: { title: "Unsaved draft" },
  });
  const secondResponse = await request.post("/api/documents", {
    data: { title: "Other document" },
  });
  const first = (await firstResponse.json()) as DocumentResponse;
  const second = (await secondResponse.json()) as DocumentResponse;

  await page.goto(`/documents/${first.data.id}`);
  await page.route(`**/api/documents/${first.data.id}/content`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PERSISTENCE_FAILURE",
          message: "Simulated disk failure.",
        },
      }),
    }),
  );

  const editor = page.getByRole("textbox", { name: "My Draft editor" });
  await editor.click();
  await page.keyboard.type("This edit must remain in memory.");
  await expect(
    page.getByText("Your changes are still in this editor."),
  ).toBeVisible({ timeout: 5_000 });

  await page
    .getByRole("button", { name: "Other document", exact: false })
    .click();
  await expect(page).toHaveURL(new RegExp(`/documents/${first.data.id}$`));
  await expect(editor).toContainText("This edit must remain in memory.");
  await expect(
    page.getByText(
      "Save this draft successfully before opening another document.",
    ),
  ).toBeVisible();

  await page.unroute(`**/api/documents/${first.data.id}/content`);
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  await page
    .getByRole("button", { name: "Other document", exact: false })
    .click();
  await expect(page).toHaveURL(new RegExp(`/documents/${second.data.id}$`));
});

test("document switching preserves isolated in-session undo history", async ({
  page,
  request,
}) => {
  const firstResponse = await request.post("/api/documents", {
    data: { title: "History document A" },
  });
  const secondResponse = await request.post("/api/documents", {
    data: { title: "History document B" },
  });
  const first = (await firstResponse.json()) as DocumentResponse;
  const second = (await secondResponse.json()) as DocumentResponse;

  await page.goto(`/documents/${first.data.id}`);
  const editor = page.getByRole("textbox", { name: "My Draft editor" });
  await editor.click();
  await page.keyboard.type("A continuous writing burst");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page
    .getByRole("button", { name: "History document B", exact: false })
    .click();
  await expect(page).toHaveURL(new RegExp(`/documents/${second.data.id}$`));
  const secondEditor = page.getByRole("textbox", {
    name: "My Draft editor",
  });
  await secondEditor.click();
  await page.keyboard.type("Independent document text");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });

  await page
    .getByRole("button", { name: "History document A", exact: false })
    .click();
  await expect(page).toHaveURL(new RegExp(`/documents/${first.data.id}$`));
  await expect(editor).toContainText("A continuous writing burst");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor).not.toContainText("A continuous writing burst");
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  await page
    .getByRole("button", { name: "History document B", exact: false })
    .click();
  await expect(secondEditor).toContainText("Independent document text");
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("workspace divider resizes accessibly while keeping My Draft primary", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/documents", {
    data: { title: "Resizable workspace" },
  });
  const document = (await response.json()) as DocumentResponse;
  await page.goto(`/documents/${document.data.id}`);

  const divider = page.getByRole("separator", {
    name: "Resize My Draft and Proposal Workspace",
  });
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("aria-valuenow", "64");

  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "66");
  await page.keyboard.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "78");
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "78");
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "58");

  const workspaceBounds = await page.locator(".workspace-grid").boundingBox();
  if (!workspaceBounds) {
    throw new Error("Workspace bounds were unavailable.");
  }
  await divider.hover();
  await page.mouse.down();
  await page.mouse.move(
    workspaceBounds.x + workspaceBounds.width * 0.7,
    workspaceBounds.y + workspaceBounds.height / 2,
  );
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", "70");

  await page.setViewportSize({ width: 1_000, height: 800 });
  await expect(divider).toBeHidden();
  await expect(page.getByRole("heading", { name: "My Draft" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Proposal Workspace" }),
  ).toBeVisible();
});
