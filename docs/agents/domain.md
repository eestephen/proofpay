# Domain Docs

How the engineering skills use this repo's domain documentation. Layout:
**single-context**.

## Read these before exploring

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read the ADRs that touch the area you are about to work in.

If a file is missing, carry on without comment. `/domain-modeling` creates these
files when a term or decision actually gets settled.

## Layout

```
/
├── GLOSSARY.md
├── docs/adr/
└── src/
```

## Use the glossary's terms

When you name a domain concept (in an issue title, test name, hypothesis or
refactor proposal), use the term `GLOSSARY.md` defines. Don't swap in the
synonyms it lists under "avoid".

If the concept isn't in the glossary yet, either you are inventing a term the
project doesn't use (reconsider) or there is a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an ADR, say so explicitly instead of silently
overriding it:

> _Contradicts ADR-0001 (stack), but worth reopening because…_
