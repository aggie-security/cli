# Project Profile

## System
- name: AGI.security CLI
- repo path: /Users/agisecurity/clawd/packages/cli
- primary language/runtime: Node.js / ESM CLI
- deploy surface: local developer workstation, npm-style CLI distribution

## Security-Relevant Notes
- auth surface: local filesystem workflows, future API keys, command execution boundaries
- secrets handling: local env vars, repo-local config, generated review artifacts
- third-party integrations: npm ecosystem, local git repos, future GitHub/CI workflows
- known risky areas: package scripts, GitHub Actions, secret leakage, unsafe defaults, trust boundaries in local automation

## Review Priorities
- default focus: repo-security-review
- key questions:
  - What secrets or trust boundaries matter most?
  - Which workflows create the highest security risk?
