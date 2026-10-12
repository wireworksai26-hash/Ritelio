#!/usr/bin/env node
// Pemeriksa kontrak frontend <-> backend.
//
// 1. Membaca semua controller NestJS (server/src/modules/**/*.controller.ts) dan
//    menyusun daftar rute: global prefix `v1` + @Controller(prefix) + @Get/@Post/...
// 2. Memindai src/** untuk setiap path '/v1/...' (string atau template literal),
//    mengambil method dari `method: 'POST'` pada pemanggilan apiFetch; useResource = GET.
// 3. Melaporkan pemanggilan frontend tanpa rute backend padanannya. Exit 1 bila ada.
//
// Batasan yang disengaja (lihat juga README di bagian bawah file ini):
//  - Segmen dinamis frontend (${id}) dianggap cocok dengan segmen apa pun di backend.
//  - Path yang tidak berada langsung di argumen pertama apiFetch/useResource (mis. dalam
//    objek konfigurasi) hanya diperiksa path-nya (method "apa saja").
//  - Skrip statis: tidak mengeksekusi kode, tidak memeriksa bentuk body/respons.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_PREFIX = 'v1';
const HTTP_METHODS = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

// Endpoint yang dipanggil frontend tetapi (sengaja) belum ada di backend.
// Setiap entri WAJIB berisi alasan. Format kunci: "METHOD /v1/path/:param".
const ALLOWLIST = new Map([
  // (kosong) — tambahkan di sini hanya bila endpoint memang belum ada di backend dan sudah dilaporkan.
]);

// ---------- util berkas ----------
function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const norm = (p) => p.replace(/\\/g, '/');

function stripComments(src) {
  // Hapus komentar tanpa merusak string: pindai karakter demi karakter.
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i++];
        }
        out += src[i++] ?? '';
        if (q !== '`' && src[i] === '\n') break;
      }
      out += src[i] ?? '';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// ---------- 1. rute backend ----------
function joinPath(...parts) {
  return (
    '/' +
    parts
      .flatMap((p) => String(p).split('/'))
      .filter(Boolean)
      .join('/')
  );
}

function parseControllers() {
  const dir = join(ROOT, 'server', 'src');
  const files = walk(dir, (f) => f.endsWith('.controller.ts'));
  const routes = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    const ctrl = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(src);
    if (!ctrl) continue;
    const prefix = ctrl[1] ?? '';
    const re = new RegExp(`@(${HTTP_METHODS.join('|')})\\(\\s*(?:\\[([^\\]]*)\\]|['"\`]([^'"\`]*)['"\`])?\\s*\\)`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const method = m[1].toUpperCase();
      const subs = m[2] !== undefined ? [...m[2].matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]) : [m[3] ?? ''];
      for (const sub of subs) {
        routes.push({ method, path: joinPath(GLOBAL_PREFIX, prefix, sub), file: norm(relative(ROOT, file)) });
      }
    }
  }
  return routes;
}

const segs = (p) => p.split('/').filter(Boolean);

function routeMatches(route, call) {
  const rs = segs(route.path);
  const cs = segs(call.path);
  if (rs.length !== cs.length) return false;
  return rs.every((seg, i) => seg.startsWith(':') || cs[i].startsWith(':') || seg === cs[i]);
}

// ---------- 2. pemanggilan frontend ----------
// Lexer kecil: cukup untuk string, template (bersarang), identifier, dan tanda baca.
function lex(src) {
  const toks = [];
  let i = 0;
  const lineAt = (pos) => src.slice(0, pos).split('\n').length;

  function skipTemplateExpr(start) {
    // start = indeks setelah "${"; kembalikan indeks setelah "}" penutup dan teks ekspresi
    let depth = 1;
    let j = start;
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === "'" || ch === '"') {
        const q = ch;
        j++;
        while (j < src.length && src[j] !== q && src[j] !== '\n') {
          if (src[j] === '\\') j++;
          j++;
        }
      } else if (ch === '`') {
        j = readTemplate(j).end - 1;
      }
      j++;
    }
    return { end: j, text: src.slice(start, j - 1) };
  }

  function readTemplate(start) {
    // start menunjuk backtick pembuka
    let j = start + 1;
    const parts = []; // {lit} | {expr}
    let buf = '';
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') {
        buf += src[j + 1] ?? '';
        j += 2;
        continue;
      }
      if (src[j] === '$' && src[j + 1] === '{') {
        if (buf) parts.push({ lit: buf });
        buf = '';
        const r = skipTemplateExpr(j + 2);
        parts.push({ expr: r.text });
        j = r.end;
        continue;
      }
      buf += src[j++];
    }
    if (buf) parts.push({ lit: buf });
    return { parts, end: j + 1 };
  }

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else if (c === "'" || c === '"') {
      const start = i;
      i++;
      let v = '';
      while (i < src.length && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        v += src[i++] ?? '';
      }
      i++;
      toks.push({ t: 'str', v, pos: start, line: lineAt(start) });
    } else if (c === '`') {
      const r = readTemplate(i);
      toks.push({ t: 'tpl', parts: r.parts, pos: i, line: lineAt(i) });
      i = r.end;
    } else if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      toks.push({ t: 'id', v: src.slice(start, i), pos: start, line: lineAt(start) });
    } else if (/\d/.test(c)) {
      while (i < src.length && /[\w.]/.test(src[i])) i++;
    } else {
      toks.push({ t: 'p', v: c, pos: i, line: lineAt(i) });
      i++;
    }
  }
  return toks;
}

/** Ubah literal menjadi path template; kembalikan null bila bukan path /v1. */
function toPath(tok) {
  let text = '';
  if (tok.t === 'str') text = tok.v;
  else if (tok.t === 'tpl') {
    for (let i = 0; i < tok.parts.length; i++) {
      const p = tok.parts[i];
      if (p.lit !== undefined) text += p.lit;
      else {
        // Ternary tepat setelah segmen (tanpa "/") = sufiks query opsional, bukan segmen path.
        const isOptionalSuffix = /\?/.test(p.expr) && !text.endsWith('/') && !text.endsWith(':param') && text !== '';
        const afterParam = text.endsWith(':param') && /\?/.test(p.expr);
        if (isOptionalSuffix || afterParam) text += '\u0000';
        else text += ':param';
      }
    }
  } else return null;
  if (!text.startsWith('/v1/')) return null;
  const cut = text.split(/[?\u0000]/)[0].replace(/\/+$/, '');
  // '/v1/' polos (mis. di src/lib/api.ts) adalah manipulasi string, bukan pemanggilan
  return cut === '/v1' || cut === '' ? null : cut;
}

function extractCalls(file) {
  const src = readFileSync(file, 'utf8');
  const toks = lex(src);
  const calls = [];
  const dynamic = []; // pemanggilan apiFetch/useResource dengan argumen bukan literal
  // stack: {open, callee, argIndex, start}
  const stack = [];

  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t === 'p') {
      if (tk.v === '(' || tk.v === '[' || tk.v === '{') {
        let callee = null;
        if (tk.v === '(') {
          let k = i - 1;
          // lewati generik: apiFetch<...>(
          if (toks[k] && toks[k].t === 'p' && toks[k].v === '>') {
            let depth = 0;
            while (k >= 0) {
              const x = toks[k];
              if (x.t === 'p' && x.v === '>' && !(toks[k - 1] && toks[k - 1].v === '=')) depth++;
              else if (x.t === 'p' && x.v === '<') {
                depth--;
                if (depth === 0) break;
              }
              k--;
            }
            k--;
          }
          if (toks[k] && toks[k].t === 'id' && (toks[k].v === 'apiFetch' || toks[k].v === 'useResource' || toks[k].v === 'downloadApiFile')) callee = toks[k].v;
        }
        stack.push({ open: tk.v, callee, argIndex: 0, startTok: i });
        continue;
      }
      if (tk.v === ')' || tk.v === ']' || tk.v === '}') {
        stack.pop();
        continue;
      }
      if (tk.v === ',' && stack.length) {
        stack[stack.length - 1].argIndex++;
        continue;
      }
      continue;
    }

    const path = toPath(tk);
    if (path === null) {
      // argumen pertama apiFetch/useResource yang bukan literal -> catat sebagai dinamis
      continue;
    }
    const top = stack[stack.length - 1];
    let method = null; // null = "apa saja"
    let via = 'literal';
    if (top && top.open === '(' && top.callee && top.argIndex === 0) {
      via = top.callee;
      if (top.callee === 'useResource' || top.callee === 'downloadApiFile') method = ['GET'];
      else {
        // cari method di argumen kedua apiFetch: pindai token sampai ")" penutup
        let depth = 0;
        let found = null;
        for (let k = top.startTok + 1; k < toks.length; k++) {
          const x = toks[k];
          if (x.t === 'p' && '([{'.includes(x.v)) depth++;
          else if (x.t === 'p' && ')]}'.includes(x.v)) {
            if (depth === 0) break;
            depth--;
          } else if (x.t === 'id' && x.v === 'method' && toks[k + 1] && toks[k + 1].v === ':') {
            // kumpulkan semua string upper-case sampai koma / akhir objek tingkat sama
            const alts = [];
            let d2 = 0;
            for (let q = k + 2; q < toks.length; q++) {
              const y = toks[q];
              if (y.t === 'p' && '([{'.includes(y.v)) d2++;
              else if (y.t === 'p' && ')]}'.includes(y.v)) {
                if (d2 === 0) break;
                d2--;
              } else if (y.t === 'p' && y.v === ',' && d2 === 0) break;
              else if (y.t === 'str' && /^[A-Z]+$/.test(y.v)) alts.push(y.v);
            }
            found = alts.length ? alts : null;
            break;
          }
        }
        method = found ?? ['GET'];
      }
    }
    calls.push({ path, method, via, file: norm(relative(ROOT, file)), line: tk.line });
  }

  // apiFetch/useResource yang argumen pertamanya BUKAN literal /v1 (informasi saja)
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t === 'id' && (tk.v === 'apiFetch' || tk.v === 'useResource' || tk.v === 'downloadApiFile')) {
      let k = i + 1;
      if (toks[k] && toks[k].v === '<') {
        let depth = 0;
        while (k < toks.length) {
          const x = toks[k];
          if (x.t === 'p' && x.v === '<') depth++;
          else if (x.t === 'p' && x.v === '>' && !(toks[k - 1] && toks[k - 1].v === '=')) {
            depth--;
            if (depth === 0) break;
          }
          k++;
        }
        k++;
      }
      if (toks[k] && toks[k].v === '(') {
        // pindai argumen pertama sampai koma / penutup tingkat sama; dinamis bila tak ada literal /v1
        let depth = 0;
        let hasPath = false;
        for (let q = k + 1; q < toks.length; q++) {
          const y = toks[q];
          if (y.t === 'p' && '([{'.includes(y.v)) depth++;
          else if (y.t === 'p' && ')]}'.includes(y.v)) {
            if (depth === 0) break;
            depth--;
          } else if (y.t === 'p' && y.v === ',' && depth === 0) break;
          else if ((y.t === 'str' || y.t === 'tpl') && toPath(y) !== null) hasPath = true;
        }
        if (!hasPath) dynamic.push({ file: norm(relative(ROOT, file)), line: tk.line, name: tk.v });
      }
    }
  }
  return { calls, dynamic };
}

// ---------- 3. bandingkan ----------
function main() {
  const routes = parseControllers();
  const srcFiles = walk(join(ROOT, 'src'), (f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f));
  const calls = [];
  const dynamic = [];
  for (const f of srcFiles) {
    const r = extractCalls(f);
    calls.push(...r.calls);
    dynamic.push(...r.dynamic);
  }

  const problems = [];
  const allowed = [];
  let pathOnly = 0;
  for (const call of calls) {
    const pathMatches = routes.filter((r) => routeMatches(r, call));
    const methods = call.method ?? null;
    if (methods === null) {
      pathOnly++;
      if (process.argv.includes('--verbose')) console.log(`  path-only: ${call.file}:${call.line} ${call.path}`);
    }
    const ok = pathMatches.some((r) => methods === null || methods.includes(r.method));
    if (ok) continue;
    const key = `${(methods ?? ['ANY']).join('|')} ${call.path}`;
    const allowKey = [...ALLOWLIST.keys()].find((k) => k === key || (methods && methods.some((m) => k === `${m} ${call.path}`)));
    if (allowKey) {
      allowed.push({ call, reason: ALLOWLIST.get(allowKey) });
      continue;
    }
    problems.push({
      call,
      key,
      reason: pathMatches.length
        ? `path ada di backend tetapi method berbeda (backend: ${[...new Set(pathMatches.map((r) => r.method))].join(', ')})`
        : 'tidak ada rute backend dengan path ini',
    });
  }

  console.log(`Rute backend      : ${routes.length}`);
  console.log(`Pemanggilan FE    : ${calls.length} (${pathOnly} hanya dicek path-nya)`);
  if (dynamic.length) {
    console.log(`Dinamis (tak dapat dianalisis): ${dynamic.length}`);
    for (const d of dynamic) console.log(`  - ${d.file}:${d.line} ${d.name}(...)${d.note ? ` [${d.note}]` : ''}`);
  }
  for (const a of allowed) {
    console.log(`Dikecualikan: ${a.call.file}:${a.call.line} ${a.call.path} -> ${a.reason}`);
  }

  if (problems.length) {
    console.error(`\nKONTRAK RUSAK: ${problems.length} pemanggilan frontend tanpa rute backend padanan\n`);
    for (const p of problems) {
      console.error(`  ${p.call.file}:${p.call.line}  ${p.key}`);
      console.error(`      ${p.reason}`);
    }
    process.exit(1);
  }
  console.log('\nKontrak API OK: semua pemanggilan frontend punya rute backend.');
}

main();
