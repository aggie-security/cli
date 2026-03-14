# Changelog

All notable changes to `@agisecurity/cli` are documented here.

---

## [0.1.3] — 2026-03-14

### Fixed
- **Hardcoded credential false positive** — `hardcoded_credential_var` pattern now excludes values containing spaces. Error messages like `invalidPasswordErrorMessage = "Invalid password"` no longer match; real credentials (which never contain spaces) still do.

---

## [0.1.2] — 2026-03-14

### Improved
- **Auth finding severity** — when all auth/session evidence is exclusively in `examples/`, `test/`, or `spec/` directories, the finding is automatically demoted from MEDIUM to LOW with an updated title and recommendation.
- **Auth scan scope** — `package.json`, `package-lock.json`, and lockfiles are excluded from auth/session pattern matching. Dependency names in manifests are not code-level risks.

---

## [0.1.1] — 2026-03-14

### Added
- **Hardcoded credential variable detection** — new pattern `hardcoded_credential_var` catches variable names containing `SECRET`, `PASSWORD`, `PASSWD`, `API_KEY`, `AUTH_TOKEN`, `ACCESS_KEY`, `PRIVATE_KEY`, or `CLIENT_SECRET` assigned to string literals (e.g. `SECRET_KEY = "..."`, `DB_PASSWORD = "..."`).
- **JWT algorithm bypass detection** — new pattern `jwt_none_alg` flags `algorithms: ['none', ...]` patterns, a known JWT verification bypass.
- **Lower minimum secret length** — `api_key_literal` minimum value length reduced from 16 to 8 characters to catch shorter but still suspicious literals.

### Package
- Added `publishConfig` (public access, npmjs registry)
- Added `files` allowlist: `bin/`, `src/`, `skills/`, `README.md`
- Added `keywords`, `license`, `homepage`, `repository`
- Removed `"private": true`
- README rewritten for npm audience with `npx @agisecurity/cli review` as hero command

---

## [0.1.0] — 2026-03-10

### Initial release

**Commands:**
- `agi init` — initialize `.agi-security/` workspace in any repo
- `agi doctor` — check workspace health and readiness
- `agi skills list` — list built-in + local skill registry
- `agi review` — run a repo security review and write a markdown findings report

**`agi review` checks:**
- Missing root `.gitignore`
- Environment-style files (`.env`, `.env.local`, etc.)
- Private key / certificate artifacts (`.pem`, `.key`, `.p12`)
- Pipe-to-shell patterns in package scripts
- Risky lifecycle hooks (`preinstall`, `postinstall` with curl/bash)
- GitHub Actions: `secrets: inherit`, `pull_request_target`, remote execution, broad write permissions
- Missing lockfiles (scoped to packages with declared dependencies)
- Floating/broad semver specifiers (`^`, `~`, `*`, `latest`)
- Remote git/URL dependency sources
- Auth/session/CORS boundary signals (JWT, express-session, NextAuth, wildcard CORS)
- Hardcoded secret/token literals (GitHub PAT, AWS access key, Slack token, private key blocks)

**Proof:** 7 real-world review loops completed before initial publish. 0 false HIGHs across all production/OSS runs. See `PROOF.md`.
