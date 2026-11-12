import { test, expect } from "@playwright/test";

test("landing page introduces all five coverage classes", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/COVRA/i);
  for (const risk of [
    "Service failure", "Dependency outage", "Execution error", "DeFi protection", "Business interruption",
  ]) await expect(page.getByText(risk, { exact: true }).first()).toBeVisible();
});

test("landing page reports verified deployment state without a fabricated awaiting label", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".visual-circle-inner strong")).toHaveText(/Deployed|Unavailable|Verifying/);
  await expect(page.locator(".visual-cards")).not.toContainText(/awaiting deployment/i);
});

test("capital activity is not exposed before wallet authentication", async ({ request }) => {
  const response = await request.get("/api/activity");
  expect(response.status()).toBe(401);
});

test("workspace surfaces show testnet configuration and empty-state truth", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText(/testnet|awaiting deployment|no indexed/i).first()).toBeVisible();
});

test("developers page explains agent integration", async ({ page }) => {
  await page.goto("/developers");
  await expect(page.getByText(/agent/i).first()).toBeVisible();
});

test("public protocol tour is wallet-optional and receipt-backed", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /See the record/i })).toBeVisible();
  await expect(page.getByText("Service failure", { exact: true })).toBeVisible();
  await expect(page.getByText("Dependency outage", { exact: true })).toBeVisible();
  await expect(page.getByText("INSUFFICIENT EVIDENCE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Wallet required/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/demoMetrics|demoPolicies|demoClaims|demoActivity/i);
  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
});

test("first pilot case study shows the real fail-closed result", async ({ page }) => {
  await page.goto("/case-study/first-pilot", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /The first pilot/i })).toBeVisible();
  await expect(page.getByText("Base pool deposit", { exact: true })).toBeVisible();
  await expect(page.getByText("Settlement withheld", { exact: true })).toBeVisible();
  await expect(page.getByText(/EARLIEST RELEASE/i)).toBeVisible();
  await expect(page.getByText(/No payout authorized/i)).toBeVisible();
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
