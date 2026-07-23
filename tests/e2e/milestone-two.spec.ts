import { expect, test } from "@playwright/test";

test("generates, edits, saves, and reopens an Alternative without changing My Draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();

  const draft = page.getByRole("textbox", { name: "My Draft editor" });
  await draft.click();
  await page.keyboard.type(
    "We utilize the current draft in order to explain 12 results.",
  );
  await expect(page.locator(".proposal-scope-block")).toBeVisible();
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  const canonicalText = await draft.innerText();

  await page.getByRole("button", { name: "Improve clarity" }).click();
  await expect(page.getByLabel("Instruction")).toHaveValue("Improve clarity");
  await page.getByRole("button", { name: "Generate Alternative" }).click();
  await expect(
    page.getByText("Generating deterministic demo content…"),
  ).toBeVisible();

  await expect(draft).toHaveText(canonicalText);
  await expect(page.getByText("Proposal original is immutable")).toBeVisible();
  await expect(page.getByText("Changed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Alternative" }).click();
  const alternative = page.getByRole("textbox", {
    name: "Alternative editor",
  });
  await expect(alternative).toContainText(
    "We use the current draft to explain 12 results.",
  );

  await alternative.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited independently.");
  await expect(
    page.locator(".alternative-editor-shell .save-status"),
  ).toHaveText("Edited · Saved", { timeout: 5_000 });
  await expect(draft).toHaveText(canonicalText);

  await page.getByRole("button", { name: /Alternatives \(1\)/ }).click();
  await expect(page.getByText(/Edited$/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Alternatives \(1\)/ }).click();
  await page.getByRole("button", { name: /Improve clarity.*Edited/s }).click();
  await page.getByRole("button", { name: "Edit Alternative" }).click();
  await expect(alternative).toContainText("Edited independently.");
  await expect(draft).toHaveText(canonicalText);
});

test("cancellation and a failed draft save leave the current workspace unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();
  const draft = page.getByRole("textbox", { name: "My Draft editor" });
  await draft.click();
  await page.keyboard.type("A stable draft.");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });

  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.getByRole("button", { name: "Generate Alternative" }).click();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page.getByText(/Generation was cancelled/)).toBeVisible();
  await expect(page.getByText("No Alternative selected")).toBeVisible();
  await expect(draft).toContainText("A stable draft.");

  const documentId = page.url().split("/").at(-1)!;
  await page.route(`**/api/documents/${documentId}/content`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PERSISTENCE_FAILURE",
          message: "Simulated save failure.",
        },
      }),
    }),
  );
  await draft.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Unsaved but preserved.");
  await page.getByRole("button", { name: "Improve clarity" }).click();
  await page.getByRole("button", { name: "Generate Alternative" }).click();
  await expect(
    page.getByText(/Generation is blocked until My Draft saves successfully/),
  ).toBeVisible({ timeout: 5_000 });
  await expect(draft).toContainText("Unsaved but preserved.");
  await expect(page.getByText("No Alternative selected")).toBeVisible();
});
