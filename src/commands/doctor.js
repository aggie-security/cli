import fs from 'node:fs';
import path from 'node:path';
import { getAgiDir, getLocalRegistryPath } from '../lib/paths.js';
import { loadBuiltInRegistry } from '../lib/registry.js';

function check(label, ok, detail) {
  const prefix = ok ? 'OK   ' : 'WARN ';
  console.log(`${prefix}${label} — ${detail}`);
}

export async function runDoctor({ cwd }) {
  const agiDir = getAgiDir(cwd);
  const configPath = path.join(agiDir, 'config.json');
  const localRegistryPath = getLocalRegistryPath(cwd);
  const builtInRegistry = await loadBuiltInRegistry();
  const projectProfilePath = path.join(agiDir, 'context', 'project-profile.md');
  const workflowSpecPath = path.join(agiDir, 'workflows', 'repo-security-review.md');
  const reviewTemplatePath = path.join(agiDir, 'templates', 'review-template.md');
  const outputsPath = path.join(agiDir, 'outputs');

  console.log('AGI.security doctor');
  console.log(`cwd: ${cwd}`);
  console.log('');

  check('node', Number(process.versions.node.split('.')[0]) >= 20, `running ${process.versions.node}`);
  check('workspace', fs.existsSync(cwd), 'current working directory is accessible');
  check('.agi-security', fs.existsSync(agiDir), fs.existsSync(agiDir) ? 'workspace initialized' : 'run `agi init`');
  check('config.json', fs.existsSync(configPath), fs.existsSync(configPath) ? path.relative(cwd, configPath) : 'missing');
  check('local skills registry', fs.existsSync(localRegistryPath), fs.existsSync(localRegistryPath) ? path.relative(cwd, localRegistryPath) : 'missing');
  check('project profile', fs.existsSync(projectProfilePath), fs.existsSync(projectProfilePath) ? path.relative(cwd, projectProfilePath) : 'missing');
  check('workflow spec', fs.existsSync(workflowSpecPath), fs.existsSync(workflowSpecPath) ? path.relative(cwd, workflowSpecPath) : 'missing');
  check('review template', fs.existsSync(reviewTemplatePath), fs.existsSync(reviewTemplatePath) ? path.relative(cwd, reviewTemplatePath) : 'missing');
  check('outputs dir', fs.existsSync(outputsPath), fs.existsSync(outputsPath) ? path.relative(cwd, outputsPath) : 'missing');
  check('built-in registry', Array.isArray(builtInRegistry.skills), `${builtInRegistry.skills.length} built-in skills available`);
}
