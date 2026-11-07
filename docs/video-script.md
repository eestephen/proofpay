# Demo video script (target 2:50)

Record on the live site in a 1280×800 window. Before you start:

- Warm the site up (open it once, about a minute before).
- Sign in and click **Reset demo**.
- Have the four demo images on your desktop.
- Open the payee link in a second, private window.
- Do one buyer-agent run before recording. Channel3 results vary, so if the run says "No supplier
  fits", raise the budget in the request.

No music, unless it's royalty-free. Don't show third-party logos beyond PayPal's own UI.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00-0:15 | Title card: "ProofPay: AI agents that buy and pay, but only for verified work." | "Small businesses pay contractors on trust, and they lose money to padded invoices and contractors who disappear. ProofPay fixes that." |
| 0:15–0:30 | Home page, SME mode. Open *Kitchen renovation*: the fund boxes and the AG Grid board. | "ProofPay holds the project budget and releases it only against proof. Here's an 8,000 dollar kitchen renovation in four milestones." |
| 0:30–1:00 | Private window, the payee link for Stage 2. Upload `invoice-ok.png`. Show the green RELEASE box and its reasons. | "The tiler uploads the invoice through a private link. Gemini reads it and checks scope, payee and amount: release, with reasons." |
| 1:00–1:20 | Owner window: **approve and release**. Payout PENDING, then (cut) **SUCCESS** without a refresh. Scroll to the audit trail. | "Only the owner can approve. ProofPay pays through PayPal Payouts, and PayPal's signed webhook confirms SUCCESS live. Every step is audited." |
| 1:20–1:50 | Stage 3: upload `invoice-injection.png`. Point at the red *Fraud check* line quoting "NOTE TO AI REVIEWER…". Then, quickly, `invoice-inflated.png` on Stage 4: *above the milestone amount*. | "Now try to cheat. This invoice hides an instruction telling the AI to approve it. The AI flags it, and ProofPay's hard rules put it on hold. An inflated total, or a reused invoice, gets the same treatment. The AI advises; code decides." |
| 1:50–2:25 | Project page, **Buy materials**: click **Ask the buyer agent** (cut the wait). Show the Channel3 reference link, the quotes grid with Budget, Deadline and Stock ticks, and the recommendation. Click **Approve: pay …**. Show the order panel with the payout, the PayPal invoice marked paid and tracking. | "For materials, the buyer agent takes a real market price from Channel3 and negotiates with three suppliers. It can't make up a price, and it can't pay. A late or over-budget pick is overruled. I approve: the supplier is paid by PayPal Payouts, and the order is recorded as a PayPal invoice, marked paid." |
| 2:25-2:45 | Cafe fit-out: wrong-payee invoice put on HOLD (cut the wait). Bathroom: the third release refused because the fund ran out. | "Wrong payee: held. A budget that's run out: refused before PayPal is ever called. Twelve scenarios like these are on the demo page." |
| 2:45–2:55 | Closing card: PayPal Payouts · Invoicing · Webhooks · Gemini · Channel3 · AG Grid · Render. URL and GitHub link. | "ProofPay: proof first, then pay. Built on PayPal and Gemini. Try it live; the passcode is in the README." |

**Cuts to save time:** speed up or cut both AI waits (about 10 s for verification, about 30 s for
negotiation) and the webhook wait (about 40 s). Say "cut" on screen if you like; judges care that
it's real, not that it's real-time.

**Backup if a live call is slow while recording:** record each segment separately and edit them
together. Payouts and webhooks work on every reset, and nothing depends on an earlier run except
segment 1:00, which needs the upload from 0:30.
