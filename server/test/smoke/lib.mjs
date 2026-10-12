// Helper smoke test terhadap API yang SUDAH berjalan (bukan mock).
// Pakai: API_URL=http://localhost:4010/v1 node test/smoke/<file>.mjs
export const API = process.env.API_URL ?? 'http://localhost:4000/v1';

export async function call(token, method, path, body, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

export async function login(email, password) {
  const r = await call(null, 'POST', '/auth/login', { email, password });
  if (!r.body?.accessToken) throw new Error(`login gagal ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

let failures = 0;
export function check(name, ok, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
}
export function done() {
  console.log(failures === 0 ? '\nSEMUA LULUS' : `\n${failures} GAGAL`);
  process.exit(failures === 0 ? 0 : 1);
}
