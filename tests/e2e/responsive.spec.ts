import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const routes = [
  "/",
  "/demo",
  "/case-study/first-pilot",
  "/app",
  "/app/coverage",
  "/app/quote",
  "/app/policies",
  "/app/claims",
  "/app/pools",
  "/app/agents",
  "/app/activity",
  "/app/settings",
  "/underwrite",
  "/developers",
];

const widths = [320, 360, 375, 390, 414, 430, 768, 1024];

function slug(route: string) {
  return route === "/" ? "landing" : route.replace(/^\//, "").replaceAll("/", "-");
}

test("all primary routes remain usable across supported viewport widths", async ({ page }, testInfo) => {
  // The production matrix covers eight widths and every primary route. WebKit
  // can require several minutes when it cold-starts the hosted app; retain
  // the same assertions while giving the external runtime a bounded budget.
  test.setTimeout(420_000);
  mkdirSync(testInfo.outputDir, { recursive: true });

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();

      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      expect(layout.documentWidth, `${route} document overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.bodyWidth, `${route} body overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport + 1);

      const outOfViewport = await page.locator("button:visible, input:visible, select:visible, textarea:visible, a:visible").evaluateAll((elements, viewportWidth) =>
        elements.flatMap(element => {
          const rect = element.getBoundingClientRect();
          // The closed mobile sidebar is translated off the left edge by design;
          // only right-edge overflow can expand the document and break the task.
          return rect.right > viewportWidth + 1
            ? [{ tag: element.tagName, text: (element.textContent || "").trim().slice(0, 80), right: rect.right, left: rect.left }]
            : [];
        }),
        width,
      );
      expect(outOfViewport, `${route} has controls outside the ${width}px viewport`).toEqual([]);

      if (width === 320 || width === 1024) {
        await page.screenshot({ path: join(testInfo.outputDir, `${width}-${slug(route)}.png`), fullPage: true });
      }

      if (route === "/app/pools") {
        // The pool screen performs a verified API read on mount. Wait for the
        // client hydration/read cycle before editing controlled inputs, or a
        // dev-server hydration pass can legitimately restore the SSR value.
        await page.waitForLoadState("networkidle");
        const risk = page.locator("#pool-risk");
        const amount = page.locator("#pool-amount");
        const withdrawal = page.locator("#withdraw-amount");
        const withdrawalRisk = page.locator("#withdraw-risk");
        await expect(risk).toBeVisible();
        await expect(amount).toBeVisible();
        await expect(withdrawal).toBeVisible();
        await expect(withdrawalRisk).toBeVisible();
        await risk.selectOption("1");
        await withdrawalRisk.selectOption("2");
        await amount.fill("100.00");
        await withdrawal.fill("1.25");
        await expect(amount).toHaveValue("100.00");
        await expect(withdrawal).toHaveValue("1.25");
        await expect(page.getByText("Owned shares", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Max", exact: true })).toBeVisible();
        for (const name of [/Approve & deposit test USDC/i, /Confirm & request withdrawal/i]) {
          const action = page.getByRole("button", { name });
          await expect(action).toBeVisible();
          const minHeight = await action.evaluate(element => Number.parseFloat(getComputedStyle(element).minHeight));
          expect(minHeight).toBeGreaterThanOrEqual(width <= 600 ? 46 : 0);
        }
        const formColumns = await page.locator(".pool-form-layout").evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
        if (width <= 900) expect(formColumns).toBe(1);
      }
    }
  }
});

test("mobile navigation and wallet-unavailable guidance are usable", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/app/pools", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".app-sidebar.sidebar-mobile-open")).toBeVisible();
  await page.getByRole("link", { name: "Coverage", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/coverage$/, { timeout: 30_000 });

  await page.goto("/app/pools", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /EIP-1193|in-app browser|wallet/i })).toBeVisible();
});

test("wrong-network wallet rejection is explained without claiming a connection", async ({ page }) => {
  await page.addInitScript(() => {
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain") {
          throw Object.assign(new Error("User rejected the request"), { code: 4001 });
        }
        if (method === "wallet_addEthereumChain") {
          throw Object.assign(new Error("User rejected the request"), { code: 4001 });
        }
        return null;
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/app/pools", { waitUntil: "networkidle" });
  const switchButtons = page.getByRole("button", { name: "Switch to Base Sepolia", exact: true });
  await expect(switchButtons.first()).toBeVisible();
  await switchButtons.first().click();
  await expect(page.getByRole("alert").filter({ hasText: /rejected/i }).first()).toBeVisible();
});
