import { expect, test } from "@playwright/test";

test("accepts one sentence into My Draft and reverts the Merge", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();
  const draft = page.getByRole("textbox", { name: "My Draft editor" });
  await draft.click();
  await page.keyboard.type("We utilize this sentence in order to test it.");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Improve clarity" }).click();
  await page.getByRole("button", { name: "Generate Alternative" }).click();
  await page.getByRole("button", { name: "Accept sentence" }).click();
  await expect(draft).toContainText("We use this sentence to test it.");
  await expect(
    page.getByRole("button", { name: "Revert Merge" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revert Merge" }).click();
  await expect(draft).toContainText(
    "We utilize this sentence in order to test it.",
  );
});

test("requires acknowledgment before accepting a complete section", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();
  const draft = page.getByRole("textbox", { name: "My Draft editor" });
  await draft.click();
  await page.keyboard.type("We utilize this section in order to test it.");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Improve clarity" }).click();
  await page.getByRole("button", { name: "Generate Alternative" }).click();
  await page.getByRole("button", { name: "Review and accept section" }).click();
  const accept = page.getByRole("button", {
    name: "Accept section changes",
  });
  await expect(accept).toBeDisabled();
  await page.getByLabel("I reviewed all changes in this section.").check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(draft).toContainText("We use this section to test it.");
});
