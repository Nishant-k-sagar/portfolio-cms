import { expect, test } from "@playwright/test";

test("shows the GitHub sign-in screen when unauthenticated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to publish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with GitHub" }),
  ).toBeVisible();
});
