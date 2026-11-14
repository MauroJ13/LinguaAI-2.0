import { handleApi } from '../server/api.mjs';

/** Serverless wrapper (Vercel-style Node function) for GET /api/status. */
export default async function handler(req, res) {
  const result = await handleApi({ method: req.method ?? 'GET', path: '/api/status' }, process.env);
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body));
}
