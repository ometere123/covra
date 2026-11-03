/** Real hosted browser verification. Wallet signing stays in Node; no transaction is submitted. */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, hexToString, sha256, toHex } from "viem";
import { baseSepolia } from "viem/chains";
const origin = "https://covra-lyart.vercel.app";
const out = "test-results/production";
mkdirSync(out, { recursive: true });
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const chain = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const chainId = await chain.getChainId();
if (chainId !== 84532) throw new Error("Wrong testnet");
const browser = await chromium.launch();
const results = [];
try {
  for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of ["/", "/developers", "/underwrite", "/app", "/app/coverage", "/app/quote", "/app/policies", "/app/claims", "/app/pools", "/app/agents", "/app/activity", "/app/settings"]) {
      const response = await page.goto(origin + route, { waitUntil: "networkidle" });
      if (response.status() !== 200) throw new Error(route + " returned " + response.status());
      const text = await page.locator("body").innerText();
      if (!/testnet/i.test(text) || /demoMetrics|demoPolicies|demoClaims|demoActivity/.test(text)) throw new Error("Untruthful surface: " + route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      if (overflow) throw new Error("Horizontal overflow: " + device + " " + route);
      await page.screenshot({ path: `${out}/${device}-${route.replaceAll("/", "-") || "landing"}.png`, fullPage: true });
      results.push({ device, route, status: response.status(), overflow });
    }
    await context.close();
    console.log(device, "12 production routes verified with screenshots and overflow checks");
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.exposeBinding("covraWalletRequest", async (_source, request) => {
    if (["eth_accounts", "eth_requestAccounts"].includes(request.method)) return [account.address];
    if (request.method === "eth_chainId") return toHex(chainId);
    if (request.method === "personal_sign") {
      const message = hexToString(request.params[0]);
      if (!message.startsWith("COVRA account access\n") || !message.includes("Domain: covra-lyart.vercel.app\n") ||
          !message.includes("Wallet: " + account.address.toLowerCase() + "\n")) throw new Error("Unexpected signature request");
      return account.signMessage({ message });
    }
    throw new Error("Browser verifier does not authorize wallet method " + request.method);
  });
  await context.addInitScript(() => {
    window.ethereum = { request: request => window.covraWalletRequest(request), on() {}, removeListener() {} };
  });
  const page = await context.newPage();
  await page.goto(origin + "/app/quote", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in to issue policy" }).click();
  await page.getByRole("button", { name: "Sign in to issue policy" }).waitFor({ state: "hidden" });
  await page.locator("#cover-limit").fill("100");
  await page.locator("#duration").selectOption("7");
  // This is a real prospective quote for a verifier task, never an incident or purchased policy.
  await page.locator("#risk-subject").fill("covra-production-verification");
  await page.locator("#risk-reference").fill(sha256(toHex("COVRA production verifier task: no loss or policy purchase asserted")));
  await page.locator("#risk-statement").fill("Prospective testnet coverage for the named verification task only; no incident or loss is asserted.");
  await page.locator("#risk-issuer").fill("covra-lyart.vercel.app");
  const quoteResponse = page.waitForResponse(response => response.url() === origin + "/api/quotes" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Generate signed quote" }).click();
  const quote = await quoteResponse;
  const payload = await quote.json();
  if (!quote.ok() || !payload.executable || !payload.signature) throw new Error("Hosted signed quote failed");
  await page.getByRole("button", { name: "Approve USDC & purchase" }).waitFor();
  await page.screenshot({ path: `${out}/desktop-authenticated-quote.png`, fullPage: true });
  console.log("Actual browser wallet authentication and prospective server-signed quote verified; no purchase submitted");
  results.push({ journey: "signed-wallet-login-and-prospective-quote", policyId: payload.quote.policyId, purchased: false });
  await context.request.post(origin + "/api/auth/logout");
  await context.close();
  writeFileSync(`${out}/verification.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), origin, results }, null, 2) + "\n");
} finally { await browser.close(); }
