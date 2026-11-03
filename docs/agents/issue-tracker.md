# Issue tracker: OneDrive markdown first, then Jira

Specs and tickets go to two stores. **A spec or ticket is published only when it
exists in both.**

## 1. Local markdown (primary)

The files live in the OneDrive knowledge base, not in this repo:

```
C:\Users\P1369959\OneDrive - NCS PTE LTD\KNOWLEDGE BASE\Hackhathon\ProofPay\tracker\
```

- One feature per directory: `tracker/<feature-slug>/`
- The spec: `tracker/<feature-slug>/spec.md`
- One file per ticket: `tracker/<feature-slug>/issues/<NN>-<slug>.md`, numbered
  from `01`. Never put several tickets in one file.
- Near the top of each ticket file:
  - `Status:` with a triage label (see `triage-labels.md`)
  - `Blocked by: NN, NN` (omit when there are no blockers)
  - `Jira: PROOF-<n>` (added once the Jira mirror exists)
- Comments go at the bottom of the file under `## Comments`.

## 2. Jira (mirror)

- Site: `https://ee-zi-hao-stephen.atlassian.net` (cloudId
  `e38abb9a-f81e-4188-a53d-d1c1a5be627d`)
- Project key: `PROOF` (ProofPay), board 138
- A spec becomes an **Epic**. Each ticket becomes a **Story** under that epic,
  with its summary prefixed `NN `.
- The triage label goes on as a Jira label (for example `ready-for-agent`).
- Blocking edges become Jira "blocks" links.
- The Jira description links back to the local file path.

If project `PROOF` doesn't exist yet, write the local file first and leave out the
`Jira:` line. Mirror it once the project exists.

## When a skill says "publish to the issue tracker"

Write the local file, create the Jira issue, then add the `Jira:` line to the
local file.

## When a skill says "fetch the relevant ticket"

Read the local file. If you were only given a Jira key, look for
`Jira: <key>` under `tracker/`.

## Wayfinding operations

Used by `/wayfinder`, under the same `tracker/` root:

- **Map:** `tracker/<effort>/map.md`
- **Child ticket:** `tracker/<effort>/issues/NN-<slug>.md`, with `Type:`
  (`research`/`prototype`/`grilling`/`task`) and `Status:` (`claimed`/`resolved`)
- **Blocking:** `Blocked by: NN, NN`. A ticket is unblocked once every ticket it
  lists is `resolved`.
- **Frontier:** tickets that are open, unblocked and unclaimed. Take the lowest
  number first.
- **Claim:** set `Status: claimed` and save before starting work.
- **Resolve:** add the answer under `## Answer`, set `Status: resolved`, and add a
  pointer to `map.md` under "Decisions so far".
