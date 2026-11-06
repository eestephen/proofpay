# Glossary

| Term | Meaning | Avoid |
|---|---|---|
| **Owner** | The person whose money is in the project: an SME owner, or an NGO coordinator in NGO mode. The only role that approves a release. | admin, user |
| **Project** | A piece of work with a budget, split into milestones (e.g. "Kitchen renovation, $8,000"). | job, campaign |
| **Project fund** | Money ProofPay tracks against a project and releases in stages. It is the owner's sandbox balance, not escrow. | escrow, wallet |
| **Milestone** | One stage of a project with a fixed amount, paid to one payee once its proof is verified and approved. | task, phase |
| **Payee** | Whoever gets paid for a milestone: a subcontractor (SME mode) or a field partner (NGO mode). | vendor (see Supplier) |
| **Supplier** | A business that sells goods to the project. It is paid for an order, not for a milestone. | vendor, merchant |
| **Proof** | The evidence a payee submits for a milestone: photos, an invoice or receipt, a note. | evidence pack, upload |
| **Verification** | The AI verifier's check of proof against its milestone. It produces a recommendation and reasons. | approval |
| **Payee link** | The private link a payee uses to submit proof and see status for one milestone. Stops working after a demo reset. | upload link |
| **Hard rule** | A deterministic check ProofPay runs after the AI: total above the milestone amount, unreadable total, a file reused on another milestone or repeated in one submission, instructions aimed at the reviewer. Any hit forces `hold`. Shown as "Fraud check" in the UI. | flag (in prose) |
| **Assessment** | The stored result of verification: the AI output plus hard-rule findings and the final recommendation. | verdict |
| **Override** | The owner releasing a milestone that is on hold, after ticking an explicit confirmation. Always audited. | force release |
| **Recommendation** | The verifier's output: `release` or `hold`. Advice only; it never moves money. | decision |
| **Approval** | The owner's explicit go-ahead for a release. Required before any payout. | sign-off, verification |
| **Release** | Paying out a milestone's amount to its payee through PayPal Payouts, after approval. | disburse, transfer |
| **Mode** | `sme` or `ngo`. Changes labels, policy presets and seed data, not the engine. | tenant, edition |
