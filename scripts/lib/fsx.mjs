import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 原子写入：先写临时文件再 rename，避免并发读到半截内容 */
export function writeFileAtomic(file, content) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
  return file;
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function tryReadJson(file) {
  if (!existsSync(file)) return null;
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

export function writeJsonAtomic(file, value) {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function sha256File(file) {
  return sha256Text(readFileSync(file, 'utf8'));
}

export function removeIfExists(target) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

export function fileExists(file) {
  return existsSync(file);
}
