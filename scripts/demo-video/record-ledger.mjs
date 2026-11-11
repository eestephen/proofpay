// Fills a local ProofPay with real data, then records the Ledger page. Writes demo-video/ledger-raw.webm + ledger-raw.json
import { chromium } from "playwright-core";
import { renameSync, writeFileSync, mkdirSync } from "node:fs";

const base = "http://localhost:3077";
const out = "C:\\dev\\ProofPay\\demo-video";
const inv = (f) => `C:\\dev\\ProofPay\\public\\demo\\${f}`;
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

// 1. Data, in an unrecorded context.
const setup = await (await browser.newContext()).newPage();
setup.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 200)));
await setup.goto(`${base}/login`);
await setup.fill('input[name="passcode"]', "proofpay-demo");
await setup.getByRole("button", { name: "Sign in" }).click();
await setup.getByText("Signed in as owner").waitFor();
async function run(id, title, file, pay) {
  await setup.goto(`${base}/milestones/${id}`);
  await setup.getByText(title).first().waitFor();
  await setup.setInputFiles('input[name="proof"]', inv(file));
  await setup.getByRole("button", { name: /Submit proof/ }).click();
  await setup.getByText(/AI verifier recommends|rate limit/).first().waitFor({ timeout: 180000 });
  if (pay) {
    await setup.getByRole("button", { name: /approve and release/ }).click();
    await setup.getByText(/PayPal payout batch/).waitFor({ timeout: 60000 });
  }
  console.log("done:", title);
}
await run(2, "Stage 2: Wall and floor tiling", "invoice-ok.png", true);
await run(5, "AV and sound setup", "event-av-ok.png", true);
await run(3, "Stage 3: Plumbing and electrical", "invoice-injection.png", false);
const cookies = await setup.context().cookies();

// 2. Recording.
mkdirSync(`${out}\\ledger-rec`, { recursive: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: `${out}\\ledger-rec`, size: { width: 1280, height: 800 } },
});
await ctx.addCookies(cookies);
const t0 = Date.now();
const page = await ctx.newPage();
await page.goto(`${base}/ledger`);
await page.locator("canvas").first().waitFor();
await page.locator(".ag-root").nth(1).waitFor();
await page.waitForTimeout(800); // chart animation
const ready = (Date.now() - t0) / 1000;
await page.waitForTimeout(2000); // cards + chart
const scroll = async (y, ms) => {
  const from = await page.evaluate(() => window.scrollY);
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.evaluate((v) => window.scrollTo(0, v), from + (y - from) * e);
    await page.waitForTimeout(16);
  }
};
const top = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - 70, sel);
await scroll(await page.evaluate(() => [...document.querySelectorAll("h2")][0].getBoundingClientRect().top + window.scrollY - 20), 1000);
await page.waitForTimeout(1500); // payments grid + pinned total
await scroll(await page.evaluate(() => [...document.querySelectorAll("h2")][1].getBoundingClientRect().top + window.scrollY - 20), 1000);
await page.waitForTimeout(2200); // audit trail
const end = (Date.now() - t0) / 1000;
const video = page.video();
await ctx.close();
renameSync(await video.path(), `${out}\\ledger-raw.webm`);
writeFileSync(`${out}\\ledger-raw.json`, JSON.stringify({ ready, end }));
console.log({ ready, end, unused: typeof top });
await browser.close();
