import path from 'node:path';
import { ensureDir, writeJsonIfMissing, writeTextIfMissing } from '../lib/fs.js';
import { getAgiDir, getLocalRegistryPath } from '../lib/paths.js';
import { loadBuiltInRegistry } from '../lib/registry.js';

export async function runInit({ cwd }) {
  const agiDir = getAgiDir(cwd);
  const skillsDir = path.join(agiDir, 'skills');
  const outputsDir = path.join(agiDir, 'outputs');
  const templatesDir = path.join(agiDir, 'templates');
  const workflowsDir = path.join(agiDir, 'workflows');
  const contextDir = path.join(agiDir, 'context');

  ensureDir(agiDir);
  ensureDir(skillsDir);
  ensureDir(outputsDir);
  ensureDir(templatesDir);
  ensureDir(workflowsDir);
  ensureDir(contextDir);

  const builtInRegistry = await loadBuiltInRegistry();
  const created = [];
  const existing = [];

  const mark = (filePath, didCreate) => {
    const relativePath = path.relative(cwd, filePath);
    if (didCreate) {
      created.push(relativePath);
      return;
    }

    existing.push(relativePath);
  };

  mark(
    path.join(agiDir, 'config.json'),
    writeJsonIfMissing(path.join(agiDir, 'config.json'), {
      version: 1,
      createdBy: '@agisecurity/cli',
      defaultWorkflow: 'repo-security-review',
      outputDir: '.agi-security/outputs',
      localSkillsRegistry: '.agi-security/skills/registry.json',
      workflows: {
        repoSecurityReview: {
          spec: '.agi-security/workflows/repo-security-review.md',
          template: '.agi-security/templates/review-template.md',
          projectProfile: '.agi-security/context/project-profile.md',
          outputPattern: '.agi-security/outputs/review-<timestamp>.md',
        },
      },
    }),
  );

  mark(
    getLocalRegistryPath(cwd),
    writeJsonIfMissing(getLocalRegistryPath(cwd), {
      version: 1,
      skills: builtInRegistry.skills.map(({ id, name, category, description }) => ({
        id,
        name,
        category,
        description,
        enabled: true,
        source: 'local-extension',
      })),
    }),
  );

  mark(
    path.join(agiDir, 'README.md'),
    writeTextIfMissing(
      path.join(agiDir, 'README.md'),
      [
        '# AGI.security Workspace',
        '',
        'This directory holds local AGI.security configuration, workflow specs, and generated outputs.',
        '',
        '## Suggested flow',
        '1. Fill in `context/project-profile.md` with repo-specific facts.',
        '2. Adjust `workflows/repo-security-review.md` if you want a different review scope.',
        '3. Use `templates/review-template.md` as the reporting shape for findings.',
        '4. Save generated artifacts under `outputs/`.',
      ].join('\n'),
    ),
  );

  mark(
    path.join(contextDir, 'project-profile.md'),
    writeTextIfMissing(
      path.join(contextDir, 'project-profile.md'),
      [
        '# Project Profile',
        '',
        '## System',
        '- name:',
        '- repo path:',
        '- primary language/runtime:',
        '- deploy surface:',
        '',
        '## Security-Relevant Notes',
        '- auth surface:',
        '- secrets handling:',
        '- third-party integrations:',
        '- known risky areas:',
        '',
        '## Review Priorities',
        '- default focus: repo-security-review',
        '- key questions:',
        '  - What secrets or trust boundaries matter most?',
        '  - Which workflows create the highest security risk?',
      ].join('\n'),
    ),
  );

  mark(
    path.join(workflowsDir, 'repo-security-review.md'),
    writeTextIfMissing(
      path.join(workflowsDir, 'repo-security-review.md'),
      [
        '# Repo Security Review Workflow',
        '',
        '## Objective',
        'Produce a small, high-signal review of the current repository with emphasis on obvious security and trust gaps.',
        '',
        '## Inputs',
        '- repository source tree',
        '- `.agi-security/context/project-profile.md`',
        '- local docs that clarify architecture or deployment',
        '',
        '## Default Scope',
        '- secrets exposure risk',
        '- auth/session boundary issues',
        '- dependency or configuration red flags',
        '- unsafe defaults or missing guardrails',
        '',
        '## Output Contract',
        '- write findings using `.agi-security/templates/review-template.md`',
        '- save result under `.agi-security/outputs/`',
        '- prefer top 3-5 findings with severity and concrete next steps',
      ].join('\n'),
    ),
  );

  mark(
    path.join(templatesDir, 'review-template.md'),
    writeTextIfMissing(
      path.join(templatesDir, 'review-template.md'),
      [
        '# AGI.security Review Template',
        '',
        '## Scope',
        '- target:',
        '- intent: repo-security-review',
        '',
        '## Executive Summary',
        '- summary:',
        '',
        '## Findings',
        '### 1. <title>',
        '- severity:',
        '- evidence:',
        '- why it matters:',
        '- recommendation:',
        '',
        '## Next Actions',
        '- tighten controls',
      ].join('\n'),
    ),
  );

  mark(
    path.join(outputsDir, '.gitkeep'),
    writeTextIfMissing(path.join(outputsDir, '.gitkeep'), '# generated AGI.security outputs live here'),
  );

  console.log('Initialized AGI.security workspace in .agi-security/');

  if (created.length) {
    console.log('');
    console.log('Created:');
    for (const filePath of created) {
      console.log(`- ${filePath}`);
    }
  }

  if (existing.length) {
    console.log('');
    console.log('Already present:');
    for (const filePath of existing) {
      console.log(`- ${filePath}`);
    }
  }
}
