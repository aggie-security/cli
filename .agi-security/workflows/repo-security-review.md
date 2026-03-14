# Repo Security Review Workflow

## Objective
Produce a small, high-signal review of the current repository with emphasis on obvious security and trust gaps.

## Inputs
- repository source tree
- `.agi-security/context/project-profile.md`
- local docs that clarify architecture or deployment

## Default Scope
- secrets exposure risk
- auth/session boundary issues
- dependency or configuration red flags
- unsafe defaults or missing guardrails

## Output Contract
- write findings using `.agi-security/templates/review-template.md`
- save result under `.agi-security/outputs/`
- prefer top 3-5 findings with severity and concrete next steps
