import { test, expect } from "@playwright/test";

test("landing page introduces all five coverage classes", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/COVRA/i);
  for (const risk of [
    "Service failure", "Dependency outage", "Execution error", "DeFi protection", "Business interruption",
  ]) await expect(page.getByText(risk, { exact: true }).first()).toBeVisible();
});

test("workspace surfaces show testnet configuration and empty-state truth", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText(/testnet|awaiting deployment|no indexed/i).first()).toBeVisible();
});

test("developers page explains agent integration", async ({ page }) => {
  await page.goto("/developers");
  await expect(page.getByText(/agent/i).first()).toBeVisible();
});

test("all workspace journeys render truthful empty or configured states", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const routes = ["/app", "/app/coverage", "/app/quote", "/app/policies", "/app/claims", "/app/pools", "/app/agents", "/app/activity", "/app/settings"];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).not.toContainText(/demoMetrics|demoPolicies|demoClaims|demoActivity/i);
    await page.screenshot({
      path: `test-results/screens/${testInfo.project.name}-${(route.replace(/^\/app\/?/, "") || "overview").replaceAll("/", "-")}.png`,
      fullPage: true,
    });
  }
});
