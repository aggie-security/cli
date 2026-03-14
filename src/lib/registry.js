import fs from 'node:fs';
import { readJson } from './fs.js';
import { getBuiltInRegistryPath, getLocalRegistryPath } from './paths.js';

export async function loadBuiltInRegistry() {
  return readJson(getBuiltInRegistryPath());
}

export async function loadLocalRegistry(cwd = process.cwd()) {
  const localPath = getLocalRegistryPath(cwd);

  if (!fs.existsSync(localPath)) {
    return { version: 1, skills: [] };
  }

  return readJson(localPath);
}

export async function loadMergedRegistry(cwd = process.cwd()) {
  const builtIn = await loadBuiltInRegistry();
  const local = await loadLocalRegistry(cwd);
  const merged = new Map();

  for (const skill of builtIn.skills) {
    merged.set(skill.id, { ...skill, source: 'built-in' });
  }

  for (const skill of local.skills) {
    const existing = merged.get(skill.id) || {};
    merged.set(skill.id, { ...existing, ...skill, source: skill.source || 'local-extension' });
  }

  return {
    version: 1,
    skills: [...merged.values()],
  };
}
