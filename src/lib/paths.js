import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getCliRoot() {
  return path.resolve(__dirname, '..', '..');
}

export function getWorkspaceRoot() {
  return process.cwd();
}

export function getAgiDir(cwd = process.cwd()) {
  return path.join(cwd, '.agi-security');
}

export function getBuiltInRegistryPath() {
  return path.join(getCliRoot(), 'skills', 'registry.json');
}

export function getLocalRegistryPath(cwd = process.cwd()) {
  return path.join(getAgiDir(cwd), 'skills', 'registry.json');
}
