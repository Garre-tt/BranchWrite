import { expect, test } from "@playwright/test";

test("renders read-only Review and recalculates after Alternative edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New document" }).click();
  const draft = page.getByRole("textbox", { name: "My Draft editor" });
  await draft.click();
  await page.keyboard.type("We utilize this sentence in order to review it.");
  await expect(page.locator(".save-status:visible")).toHaveText("Saved", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Improve clarity" }).click();
  await page.getByRole("button", { name: "Generate Alternative" }).click();

  const review = page.getByLabel("Alternative Review");
  await expect(review.getByText("Changed", { exact: true })).toBeVisible();
  await expect(review.locator("del").first()).toBeVisible();
  await expect(review.locator("ins").first()).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Accept block" }),
  ).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Accept sentence" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Edit Alternative" }).click();
  const alternative = page.getByRole("textbox", {
    name: "Alternative editor",
  });
  await alternative.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Updated.");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(review.getByText("Changed", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(draft).toContainText(
    "We utilize this sentence in order to review it.",
  );
});
