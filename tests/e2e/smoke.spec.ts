import { expect, test } from "@playwright/test";

test("renders the local BranchWrite foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("BranchWrite");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "AI proposes. You decide what enters your draft.",
    }),
  ).toBeVisible();
});
