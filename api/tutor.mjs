import { handleApi } from '../server/api.mjs';

/** Serverless wrapper (Vercel-style Node function) for POST /api/tutor. */
export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'serverless';
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : undefined;
  const host = String(req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '');
  const result = await handleApi({ method: req.method ?? 'POST', path: '/api/tutor', body, ip, origin, host }, process.env);
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
  res.end(JSON.stringify(result.body));
}
