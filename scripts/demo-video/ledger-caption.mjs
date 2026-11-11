import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const text = JSON.parse(readFileSync("C:\\dev\\ProofPay\\demo-video\\neural\\neural.json", "utf8")).ledger.text;
const b = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.setContent(`<html><body style="margin:0;background:transparent"><div style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:1100px;background:rgba(17,24,39,.92);color:#fff;font:600 20px/1.35 system-ui,sans-serif;padding:12px 20px;border-radius:10px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25)">${text}</div></body></html>`);
await p.screenshot({ path: "C:\\dev\\ProofPay\\demo-video\\ledger-caption.png", omitBackground: true });
await b.close(); console.log("caption:", text);
