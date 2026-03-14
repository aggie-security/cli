import fs from 'node:fs';

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJsonIfMissing(filePath, data) {
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

export function writeTextIfMissing(filePath, data) {
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, `${data.trimEnd()}\n`, 'utf8');
  return true;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
