export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const bad = (code, msg, extra) => new HttpError(400, code, msg, extra);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);

export class Router {
  constructor() { this.routes = []; }
  add(method, path, opts, handler) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, opts: opts || {}, handler });
  }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method === method) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
      pathMatched = true;
    }
    return { pathMatched };
  }
}

export async function readJson(req, limit) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > limit) throw new HttpError(413, 'payload_too_large', 'Request body too large');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'payload_too_large', 'Request body too large');
    chunks.push(c);
  }
  if (!size) return {};
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw bad('invalid_json', 'Malformed JSON body');
  }
}

// Tiny validators: explicit field picking => no mass assignment / NoSQL operator injection.
const fail = (k, why) => new HttpError(422, 'validation_error', `${k}: ${why}`, { field: k });
export const V = {
  str(o, k, { min = 1, max = 200, re, optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined || v === null || v === '') { if (optional) return undefined; throw fail(k, 'required'); }
    if (typeof v !== 'string') throw fail(k, 'must be a string');
    const t = v.trim();
    if (t.length < min || t.length > max) throw fail(k, `length must be ${min}-${max}`);
    if (re && !re.test(t)) throw fail(k, 'invalid format');
    return t;
  },
  int(o, k, { min = 0, max = 1e9, optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined || v === null) { if (optional) return undefined; throw fail(k, 'required'); }
    if (!Number.isInteger(v) || v < min || v > max) throw fail(k, `must be integer ${min}-${max}`);
    return v;
  },
  num(o, k, { min = -1e9, max = 1e9, optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined || v === null) { if (optional) return undefined; throw fail(k, 'required'); }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw fail(k, `must be number ${min}-${max}`);
    return v;
  },
  oneOf(o, k, list, { optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined) { if (optional) return undefined; throw fail(k, 'required'); }
    if (!list.includes(v)) throw fail(k, `must be one of ${list.join(', ')}`);
    return v;
  },
  bool(o, k, { optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined) { if (optional) return undefined; throw fail(k, 'required'); }
    if (typeof v !== 'boolean') throw fail(k, 'must be boolean');
    return v;
  },
  obj(o, k, { optional = false } = {}) {
    const v = o?.[k];
    if (v === undefined) { if (optional) return undefined; throw fail(k, 'required'); }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw fail(k, 'must be an object');
    return v;
  },
  arr(o, k, { min = 0, max = 100 } = {}) {
    const v = o?.[k];
    if (!Array.isArray(v) || v.length < min || v.length > max) throw fail(k, `must be array of ${min}-${max} items`);
    return v;
  },
};
export function normalizePhone(raw) {
  const d = String(raw ?? '').replace(/[\s\-()]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(d);
  if (!m) throw fail('phone', 'enter a valid 10-digit Indian mobile number');
  return `+91${m[1]}`;
}
