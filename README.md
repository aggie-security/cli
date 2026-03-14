# @agisecurity/cli

Local-first security CLI for your repo. Run a security review in 30 seconds — no signup, no cloud, everything stays on your machine.

```bash
npx @agisecurity/cli review
```

## What it does

- Scans for **hardcoded secrets** (`SECRET_KEY`, `DB_PASSWORD`, API keys, tokens)
- Flags **JWT algorithm bypass** patterns (`algorithms: ['none', ...]`)
- Reviews **GitHub Actions** for overly broad permissions and risky triggers
- Checks **dependencies** for missing lockfiles and floating versions
- Finds **missing `.gitignore`** and env file exposure risk
- Writes a structured markdown report under `.agi-security/outputs/`

No data leaves your machine. Output is plain markdown you can read, share, or version.

## Quickstart

```bash
# One-shot review (no install needed)
npx @agisecurity/cli review

# Or install globally
npm install -g @agisecurity/cli
agi review

# Initialize workspace for richer context
agi init
agi review
```

## Commands

| Command | What it does |
|---|---|
| `agi init` | Initialize `.agi-security/` workspace in current repo |
| `agi doctor` | Check workspace health and readiness |
| `agi skills list` | List available security skills/workflows |
| `agi review` | Run a repo security review and write findings |
| `agi --version` | Print CLI version |
| `agi --help` | Show help |

## Current status

Working:
- `agi init`
- `agi doctor`
- `agi skills list`
- `agi review`

## What `agi init` creates

```text
.agi-security/
├── README.md
├── config.json
├── context/
│   └── project-profile.md   ← fill this in for better reviews
├── outputs/
│   └── .gitkeep
├── skills/
│   └── registry.json
├── templates/
│   └── review-template.md
└── workflows/
    └── repo-security-review.md
```

## What `agi init` creates

```text
.agi-security/
├── README.md
├── config.json
├── context/
│   └── project-profile.md
├── outputs/
│   └── .gitkeep
├── skills/
│   └── registry.json
├── templates/
│   └── review-template.md
└── workflows/
    └── repo-security-review.md
```

These files define a minimal but real workflow contract:
- **context/project-profile.md** — repo-specific facts and risky areas
- **workflows/repo-security-review.md** — the intended review scope
- **templates/review-template.md** — the output shape for findings
- **outputs/** — where generated review artifacts should land

## Command reference

### `agi init`
Initialize `.agi-security/` in the current working directory.

- Creates the workspace directory tree if missing
- Writes starter config, workflow, context, and template files
- Preserves existing files (safe to re-run)

```bash
agi init
```

### `agi doctor`
Check whether the workspace is ready for AGI.security workflows.

```bash
agi doctor
```

### `agi skills list`
List the merged skill registry (built-in + local overrides).

```bash
agi skills list
```

### `agi review [path]`
Run a repo security review and write a findings report to `.agi-security/outputs/`.

```bash
agi review               # review current directory
agi review /path/to/repo # review any repo on disk
```

**What it checks:**
- Hardcoded secrets (`SECRET_KEY`, `DB_PASSWORD`, API keys, tokens, private key blocks)
- JWT algorithm bypass patterns (`algorithms: ['none', ...]`)
- GitHub Actions: broad write permissions, `secrets: inherit`, `pull_request_target`, remote execution
- Missing or uncommitted lockfiles
- Floating/unpinned dependency versions
- Remote git/URL dependency sources
- Auth/session/CORS boundary signals (JWT usage, express-session, NextAuth, wildcard CORS)
- Missing root `.gitignore`
- Committed `.env` files and private key artifacts

Output is plain markdown under `.agi-security/outputs/` — readable, diffable, version-controllable.

## Example flow

```bash
# Run a one-shot review (no init needed)
npx @agisecurity/cli review

# Or set up a persistent workspace for richer context
agi init
$EDITOR .agi-security/context/project-profile.md   # add repo-specific context
agi review
```

## Proof — 7 real-world review loops

The scanner has been validated against real codebases, not just synthetic fixtures:

| Repo | Result | Key finding |
|------|--------|-------------|
| `packages/cli` (self) | 2 real issues → 0 after fixes | own repo drives own cleanup |
| Full workspace | 4 → 2 after tightening | scanner improves with real feedback |
| External local repo | Path bug fixed → 0 clean | `agi review <path>` now works correctly |
| `hagopj13/node-express-boilerplate` | 2 findings, 0 false HIGHs | JWT without algorithm hardening caught cold |
| `validatorjs/validator.js` | ReDoS fixed → 3 accurate | scanner found ReDoS in its own regex |
| `expressjs/express` | 4 findings, 0 false HIGHs | auth findings correctly demoted for example-only paths |
| `OWASP/NodeGoat` (deliberately vulnerable) | 2 HIGH, 2 other | hardcoded secrets + committed private key caught correctly |

**7 loops. 0 false HIGHs across all production/OSS runs.**

The product loop works: run → inspect findings → fix repo issues or tighten scanner → rerun → verify. Each loop makes both the tool and the repo better.

## Requirements

- Node.js 20+
- No API key, no signup, no cloud

## License

MIT
