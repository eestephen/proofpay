// Records the ProofPay demo against the live site. Writes demo-video/raw/*.webm and demo-video/timeline.json.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const base = process.env.BASE ?? "https://proofpay-988i.onrender.com";
const out = "C:\\dev\\ProofPay\\demo-video";
const demo = "C:\\dev\\ProofPay\\demo";
const narration = JSON.parse(readFileSync(`${out}\\narration.json`, "utf8"));
rmSync(`${out}\\raw`, { recursive: true, force: true });
mkdirSync(`${out}\\raw`, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});

// Warm up and reset in a context that is not recorded.
{
  const w = await (await browser.newContext()).newPage();
  await w.goto(`${base}/login`, { timeout: 180_000 });
  await w.fill('input[name="passcode"]', "proofpay-demo");
  await w.getByRole("button", { name: "Sign in" }).click();
  await w.getByText("Signed in as owner").waitFor();
  await w.getByRole("button", { name: "Reset demo" }).click();
  await w.getByText(/remaining/i).first().waitFor();
  var cookies = await w.context().cookies();
  await w.context().close();
}

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: `${out}\\raw`, size: { width: 1280, height: 800 } },
});
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const timeline = { narration: [], cuts: [] };
let caption = "";

async function showCaption() {
  await page
    .evaluate((text) => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_caption";
        el.style.cssText =
          "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:1100px;z-index:2147483647;" +
          "background:rgba(17,24,39,.92);color:#fff;font:600 20px/1.35 system-ui,sans-serif;padding:12px 20px;" +
          "border-radius:10px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none";
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = text ? "block" : "none";
    }, caption)
    .catch(() => {});
}
page.on("load", () => showCaption());

/** Starts narration line i; resolves when it has finished playing. */
function say(i) {
  caption = narration[i].text;
  timeline.narration.push({ i, at: now() });
  showCaption();
  return new Promise((r) => setTimeout(r, narration[i].duration * 1000 + 400));
}
/** A long wait that will be cut from the video (keeps the first 1.2 s). */
async function cut(label, fn) {
  caption = "";
  await showCaption();
  const start = now() + 1.2;
  await fn();
  timeline.cuts.push({ label, start, end: now() - 0.3 });
}
async function highlight(locator) {
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    el.style.outline = "4px solid #ef4444";
    el.style.outlineOffset = "4px";
    el.style.borderRadius = "6px";
  }).catch(() => {});
  await page.waitForTimeout(300);
}
const pause = (ms) => page.waitForTimeout(ms);
const card = (title, sub) =>
  page.setContent(
    `<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f172a;color:#fff;font-family:system-ui,sans-serif">
     <div style="text-align:center"><div style="font-size:64px;font-weight:800;letter-spacing:-1px">${title}</div>
     <div style="font-size:26px;margin-top:16px;color:#cbd5e1">${sub}</div></div></body>`,
  );

// 0. Title
await card("ProofPay", "AI agents that buy and pay, but only for verified work");
await say(0);

// 1. Board
let s = say(1);
await page.goto(`${base}/`);
await pause(1500);
await page.getByRole("link", { name: "Kitchen renovation, 14 Elm St" }).click();
await page.locator(".ag-row").first().waitFor();
await highlight(page.locator("dl").first());
await pause(2500);
await highlight(page.locator(".ag-root-wrapper").first());
await s;

// 2. Payee uploads proof
await page.goto(`${base}/milestones/2`);
const link = await page.getByRole("link", { name: /\/payee\/2\?t=/ }).getAttribute("href");
s = say(2);
await page.goto(`${base}${link}`);
await page.setInputFiles('input[name="proof"]', `${demo}\\invoice-ok.png`);
await pause(1200);
await page.getByRole("button", { name: "Submit proof" }).click();
await s;
await cut("AI verifying", () => page.getByText(/Check result/).waitFor({ timeout: 180_000 }));
await highlight(page.getByText(/Check result/).locator(".."));
await pause(2500);

// 3. Owner approves, webhook confirms
await page.goto(`${base}/milestones/2`);
s = say(3);
await highlight(page.getByText(/AI verifier recommends/).locator(".."));
await pause(2000);
await page.getByRole("button", { name: /approve and release/ }).click();
await page.getByText(/PayPal payout batch/).waitFor({ timeout: 60_000 });
await highlight(page.getByText(/PayPal payout batch/));
await s;
await cut("waiting for PayPal webhook", () => page.getByText(/: SUCCESS/).first().waitFor({ timeout: 300_000 }));
await highlight(page.getByText(/: SUCCESS/).first());
await pause(2000);
await highlight(page.getByText("Audit trail").locator(".."));
await pause(2500);

// 4. Prompt injection
await page.goto(`${base}/milestones/3`);
await page.setInputFiles('input[name="proof"]', `${demo}\\invoice-injection.png`);
s = say(4);
await pause(1500);
await page.getByRole("button", { name: /Submit proof/ }).click();
await s;
await cut("AI verifying", () => page.getByText(/Fraud check:|AI verifier recommends/).first().waitFor({ timeout: 180_000 }));
await highlight(page.locator('img[alt="Submitted invoice"]'));
await pause(1500);
await highlight(page.getByText(/Fraud check:/).first());
await pause(3500);

// 5. Inflated total (Stage 1 is 1,500; the invoice says 1,850)
await page.goto(`${base}/milestones/1`);
await page.setInputFiles('input[name="proof"]', `${demo}\\invoice-inflated.png`);
await page.getByRole("button", { name: /Submit proof/ }).click();
await cut("AI verifying", () => page.getByText(/Fraud check:|AI verifier recommends/).first().waitFor({ timeout: 180_000 }));
s = say(5);
await highlight(page.getByText(/Fraud check:/).first());
await s;

// 6. Buyer agent
// Let the per-minute AI quota recover before the negotiation; cut from the video.
await cut("quota pause", async () => {
  await page.waitForTimeout(25_000);
  await page.goto(`${base}/projects/1`);
});
await page.getByRole("heading", { name: "Buy materials" }).scrollIntoViewIfNeeded();
s = say(6);
await highlight(page.locator('textarea[name="request"]'));
await pause(2500);
await page.getByRole("button", { name: "Ask the buyer agent" }).click();
await pause(1500);
await s;
await cut("buyer agent negotiating", async () => {
  // Channel3 returns different listings each run; ask again (off camera) until a supplier fits.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByText(/Recommended:|No supplier fits/).first().waitFor({ timeout: 240_000 });
    if (await page.getByRole("button", { name: /^Approve: pay/ }).count()) return;
    console.log("no fit, asking again");
    await page.waitForTimeout(20_000);
    await page.getByRole("button", { name: "Ask the buyer agent" }).click();
    await page.waitForTimeout(3000);
  }
});
await highlight(page.getByText(/Market reference/).first());
await pause(2500);
await highlight(page.locator("section .ag-root-wrapper").first());
await pause(3000);
await highlight(page.getByText(/Recommended:|No supplier fits/).first().locator(".."));
await pause(3000);

// 7. Approve the order
const approve = page.getByRole("button", { name: /^Approve: pay/ });
s = say(7);
if (await approve.count()) {
  await highlight(approve);
  await pause(1500);
  await approve.click();
  await page.getByText(/Ordered from|Supplier payout failed/).first().waitFor({ timeout: 120_000 });
  await highlight(page.getByText(/Ordered from|Supplier payout failed/).first().locator(".."));
}
await s;
await pause(1500);

// 8. More scenarios: wrong payee (event company) and fund limit (digital agency). Prep off camera.
await cut("preparing scenarios", async () => {
  const pay = async (id, file) => {
    await page.goto(`${base}/milestones/${id}`);
    await page.setInputFiles('input[name="proof"]', `${demo}\\${file}`);
    await page.getByRole("button", { name: /Submit proof/ }).click();
    await page.getByRole("button", { name: /approve and release/ }).waitFor({ timeout: 180_000 });
    await page.getByRole("button", { name: /approve and release/ }).click();
    await page.getByText(/PayPal payout batch/).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(13_000);
  };
  await pay(9, "web-design-ok.png");
  await pay(10, "web-build-ok.png");
  await page.goto(`${base}/milestones/11`);
  await page.setInputFiles('input[name="proof"]', `${demo}\\web-launch-ok.png`);
  await page.getByRole("button", { name: /Submit proof/ }).click();
  await page.getByRole("button", { name: /approve and release/ }).waitFor({ timeout: 180_000 });
  await page.waitForTimeout(13_000);
  await page.goto(`${base}/milestones/6`);
  await page.setInputFiles('input[name="proof"]', `${demo}\\event-photo-wrong-payee.png`);
  await page.getByRole("button", { name: /Submit proof/ }).click();
  await page.getByText(/AI verifier recommends/).waitFor({ timeout: 180_000 });
});
s = say(8);
await highlight(page.locator('img[alt="Submitted invoice"]'));
await pause(1800);
await highlight(page.getByText(/AI verifier recommends/).locator(".."));
await pause(2500);
await page.goto(`${base}/milestones/11`);
await page.getByRole("button", { name: /approve and release/ }).click();
await page.getByText(/Release refused/).waitFor({ timeout: 30_000 });
await highlight(page.getByText(/Release refused/));
await s;
await pause(1200);
// 9. Closing card
await card("ProofPay", "PayPal Payouts · Invoicing · Webhooks · Gemini · Channel3 · AG Grid · Render<br><br>proofpay-988i.onrender.com · github.com/eestephen/proofpay");
caption = "";
await say(9);
await pause(800);
timeline.end = now();

const videoPath = await page.video().path();
await ctx.close();
await browser.close();
timeline.video = videoPath;
writeFileSync(`${out}\\timeline.json`, JSON.stringify(timeline, null, 2));
console.log(JSON.stringify(timeline, null, 2));
