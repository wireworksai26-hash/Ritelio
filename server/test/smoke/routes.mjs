// Ekstraksi rute dari source controller untuk skrip smoke (tenant-isolation, rbac).
// Membaca @Controller(prefix), @Get/@Post/@Patch/@Put/@Delete, @Public, dan @RequirePermissions
// (tingkat class maupun method). Tidak butuh server berjalan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

const permsOf = (line) => {
  const m = line.match(/@RequirePermissions\(([^)]*)\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};

export function extractRoutes() {
  const routes = [];
  for (const file of walk(join(root, 'modules'))) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let prefix = '';
    let classPerms = [];
    let classPublic = false;
    let seenClass = false;
    let buf = { verb: null, sub: '', perms: null, isPublic: false };
    for (const line of lines) {
      if (!seenClass) {
        const c = line.match(/@Controller\(\s*(?:'([^']*)')?\s*\)/);
        if (c) prefix = c[1] ?? '';
        const cp = permsOf(line);
        if (cp) classPerms = cp;
        if (/^\s*@Public\(\)/.test(line)) classPublic = true;
        if (/^export class /.test(line)) seenClass = true;
        continue;
      }
      const verb = line.match(/^\s*@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/);
      if (verb) {
        buf.verb = verb[1].toUpperCase();
        buf.sub = verb[2] ?? '';
        continue;
      }
      const rp = permsOf(line);
      if (rp) buf.perms = rp;
      if (/^\s*@Public\(\)/.test(line)) buf.isPublic = true;
      if (/^\s*(async\s+)?[a-zA-Z_]\w*\s*\(/.test(line) && !/^\s*(if|for|while|switch|return|await)\b/.test(line)) {
        if (buf.verb) {
          const path = '/' + [prefix, buf.sub].filter(Boolean).join('/');
          routes.push({
            method: buf.verb,
            path: path.replace(/\/+/g, '/'),
            perms: buf.perms ?? (classPerms.length ? classPerms : []),
            isPublic: buf.isPublic || classPublic,
            file,
          });
        }
        buf = { verb: null, sub: '', perms: null, isPublic: false };
      }
    }
  }
  return routes;
}
