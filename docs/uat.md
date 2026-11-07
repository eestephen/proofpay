# ProofPay: UAT script

**Site:** https://proofpay-988i.onrender.com
**Owner passcode:** `proofpay-demo`
**Test images:** `C:\dev\ProofPay\demo\` (or download them from https://github.com/eestephen/proofpay/tree/main/demo)

- `invoice-ok.png`: a clean tiling invoice, 1,200.00
- `invoice-inflated.png`: a tiling invoice with a total of 1,850.00
- `invoice-injection.png`: has faint text telling the AI to approve it
- `cafe-electrical-ok.png`, `cafe-counter-wrong-payee.png`, `cafe-signage-vague.png`, `cafe-cleaning-lowball.png`: cafe scenarios
- `bath-waterproofing-ok.png`, `bath-tiling-ok.png`, `bath-fittings-ok.png`: bathroom budget scenario

You can also download every file from the site's **Demo scenarios** page.

**Before you start:**

- Use two browser windows. **Window A** is a normal window: you are the owner. **Window B** is a
  private/incognito window: you are the payee or a visitor.
- If the site has been idle, the first load takes about a minute.
- In Window A, sign in and click **Reset demo**.

Fill in **Result** with Pass, Fail or a note. For any Fail, take a screenshot.

---

## A. Access and sign-in

| # | Steps | Expected | Result |
|---|---|---|---|
| A1 | Window B: open the site. | The home page lists 3 projects (Kitchen 8000.00, Cafe 12000.00, Bathroom 3000.00 SGD). The header shows "Demo scenarios" and "Owner sign in". | |
| A2 | Window B: open Kitchen renovation, then Stage 2. | "Viewing as a visitor". No upload form, no approve button, no payee email, no audit trail. | |
| A3 | Window A: click **Owner sign in** and enter `wrong`. | "Wrong passcode" error. Not signed in. | |
| A4 | Window A: sign in with `proofpay-demo`. | The header shows "Signed in as owner", "Reset demo" and "Sign out". | |

## B. Pay for verified work (SME)

| # | Steps | Expected | Result |
|---|---|---|---|
| B1 | Window A: open Kitchen renovation. | Four fund boxes (Budget 8000.00, Released 0.00, Committed 0.00, Remaining 8000.00) and a grid of 4 milestones, all "Awaiting proof". | |
| B2 | In the grid, click the **Amount** header, then use a column's filter menu. | It sorts by amount, and the filter narrows the rows. | |
| B3 | Click the **Stage 2** row. Copy the **Subcontractor upload link**. | The milestone page opens, showing the link. | |
| B4 | Window B: open the link. Upload `invoice-ok.png` and click **Submit proof**. | In about 10 to 20 seconds the status reads "Proof accepted, waiting for the owner to release payment", and the check result is accepted with reasons. No approve button. | |
| B5 | Window B: change the milestone number in the link (`/payee/2` to `/payee/1`). | "This upload link is invalid or has expired". | |
| B6 | Window A: refresh Stage 2. | Green **RELEASE**, with the total read as $1,200.00 and the reasons. | |
| B7 | Click **Owner: approve and release 1200.00 SGD via PayPal**. | A PayPal payout batch appears as PENDING with "updates automatically". | |
| B8 | Wait without clicking anything (up to about 1 minute). | The status changes to **SUCCESS** by itself. The audit trail has "(webhook PAYMENT.PAYOUTS-ITEM.SUCCEEDED)". | |
| B9 | Go back to the project. | Released 1200.00, Remaining 6800.00. Stage 2 shows "Paid". | |
| B10 | Window B: open the payee link again. | Status "Paid". | |

## C. Fraud checks

Window A (owner), using the upload form on each milestone page.

| # | Steps | Expected | Result |
|---|---|---|---|
| C1 | Stage 3: upload `invoice-inflated.png`. | **HOLD**, with a red "Fraud check: Document total $1,850.00 is above the milestone amount…". | |
| C2 | Stage 4: upload `invoice-injection.png`. | **HOLD**, with a red "Fraud check: Instructions aimed at the reviewer were found…" quoting the hidden note. | |
| C3 | Stage 1: upload `invoice-ok.png` (already used on Stage 2). | **HOLD**: "The invoice was already submitted as proof for 'Stage 2…'". | |
| C4 | Stage 3: click **Override hold and release** without ticking the box. | It doesn't submit; the browser asks you to tick the box. | |
| C5 | Stage 3: tick the box and click **Override hold and release**. | A payout is sent. The audit trail has "override: owner released despite hold". | |
| C6 | Stage 1 (on hold): resubmit with a different image. | The milestone is checked again, and the audit trail shows 2 proof submissions. | |
| C7 | Upload a non-image file (e.g. a .pdf or .txt). | The file picker blocks it, or an error says "Proof must be a PNG, JPEG or WebP image". | |

## D. Buyer agent and supplier order

| # | Steps | Expected | Result |
|---|---|---|---|
| D1 | Window A: Kitchen renovation, **Buy materials**. Keep the default text and click **Ask the buyer agent**. | The button reads "Agent is negotiating…" for about 30 seconds. | |
| D2 | Check the result. | A market reference product "via Channel3" with a link, a grid of 3 suppliers (opening/final price, total, delivery, rounds, Budget/Deadline/Stock ticks), a highlighted **Recommended** supplier, the agent's reasoning and a negotiation log. | |
| D3 | Check the recommended supplier. | It has ✓ for Budget, Deadline and Stock. Jurong (7 days) is never recommended, because the deadline is 5 days. | |
| D4 | Click **Approve: pay … via PayPal**. | Order panel: "Ordered from …", a payout batch, a **PayPal invoice INV2-… MARKED_AS_PAID**, and shipment tracking with an expected date. | |
| D5 | Check the fund boxes. | Released has gone up by the order total. | |
| D6 | Send a request with a tiny budget, e.g. "Buy 40 m2 of floor tiles, max 50 SGD, within 5 days". | "No supplier fits", with no Approve button. | |
| D7 | Send "buy tiles" (no quantity, budget or deadline). | An error asks you to include a quantity, a budget and a deadline. | |

Channel3 returns different products on each run, so prices change between runs. That's expected.

## E. More scenarios (Cafe and Bathroom)

Window A, signed in. Leave about 15 seconds between uploads (free AI tier).

| # | Steps | Expected | Result |
|---|---|---|---|
| E1 | Open **Demo scenarios** from the header. | 12 numbered scenarios, each with a project or milestone link, a download link and the expected result. | |
| E2 | Cafe → Service counter carpentry: upload `cafe-counter-wrong-payee.png`. | **HOLD**: the invoice is from QuickFix Handyman, not Ong Carpentry. | |
| E3 | Cafe → Shopfront signage: upload `cafe-signage-vague.png`. | **HOLD**: "misc. works" doesn't evidence the signage work. | |
| E4 | Cafe → Deep clean and handover: upload `cafe-cleaning-lowball.png`. | **HOLD**, with a red fraud check: total far below the milestone amount. | |
| E5 | Cafe → Electrical rewiring and lighting: upload `cafe-electrical-ok.png` and approve. | **RELEASE**, and a payout is sent. | |
| E6 | Cafe project page. | The grid shows 3 on hold, 1 paid, and fraud-check counts. | |
| E7 | Bathroom → Waterproofing: upload `bath-waterproofing-ok.png` and approve. Then Wall and floor tiling: upload `bath-tiling-ok.png` and approve. | Both paid. Remaining is 400.00. | |
| E8 | Bathroom → Sanitary fittings: upload `bath-fittings-ok.png` (RELEASE), then click approve. | "Release refused: the project fund does not have enough left for this payment." No payout is sent. | |
| E9 | Bathroom project page: ask the buyer agent with its default request (grout). | A recommendation within 400 SGD, or "No supplier fits". Never a pick over the budget. | |
| E10 | Cafe project page: ask the buyer agent with its default request (pendant lights). | Three supplier quotes and a recommendation. | |
## F. Reset and sign-out

| # | Steps | Expected | Result |
|---|---|---|---|
| F1 | Window A: click **Reset demo**. | All three projects are back to Released 0.00, every milestone is "Awaiting proof", and no purchases remain. | |
| F2 | Window B: open the old payee link from B3. | "invalid or has expired". | |
| F3 | Window A: click **Sign out**, then open a milestone. | Visitor view, with no action buttons. | |

---

## Sign-off

| Area | Pass / Fail | Notes |
|---|---|---|
| A. Access | | |
| B. Verified work | | |
| C. Fraud checks | | |
| D. Buyer agent | | |
| E. More scenarios | | |
| F. Reset | | |

Tester: ____________  Date: ____________

**Known limits (not defects):**

- Sandbox money only.
- Suppliers and shipment tracking are simulated.
- Channel3 prices vary between runs.
- The first load after the site has been idle is slow.
- Data resets whenever Render restarts the service.
