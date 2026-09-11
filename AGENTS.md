# Project Agent Instructions

## Scope and Approval
- These instructions apply only to this repository.
- Do not use paths, modules, configuration, or knowledge from sibling projects.
- Before modifying, deleting, moving, installing, starting, or stopping anything, state the exact files/actions and wait for explicit user approval.
- Never touch files outside this project root unless the user explicitly names and approves them.

## Required Workflow
- Read `.codex/PROJECT_CONTEXT.md` before exploring this repository.
- Inspect only files relevant to the requested task first.
- Use search, imports, references, and symbols before opening large files.
- Do not scan the entire repository unless the saved context is stale.
- Verify the current contents of every target file before modifying it.
- Preserve unrelated user changes; this repository may not have useful Git history.
- Update `.codex/PROJECT_CONTEXT.md` whenever this project's architecture, entry points, flows, or security invariants change.

## Security and Data
- Never save secrets, tokens, passwords, `.env` values, user data, operational endpoint values, or database contents in context/documentation files.
- Never print secret values; inspect environment variable names and presence only.
- Keep server credentials out of `VITE_*` variables and frontend bundles.
- Do not expose internal endpoint URLs, host/port data, raw errors, or event payloads through the public API.
- Do not start Discord bots or inspect another Discord bot project from this repository.

## Package Manager
- Use npm with `package-lock.json`; do not switch package managers.

## Commands
| Task | Command |
|---|---|
| Development | `npm run dev` |
| Frontend only | `npm run dev:frontend` |
| Backend only | `npm run dev:backend` |
| Frontend build/typecheck | `npm run build` |
| Production server | `npm start` |
| Launcher syntax | `node --check index.js` |

- There is no automated test or lint script; do not claim tests passed when only a build/syntax check ran.
- Do not start or restart production services without explicit approval.

## Commit Attribution
AI commits must include:
```
Co-Authored-By: Codex <noreply@openai.com>
```
