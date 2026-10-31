const { timingSafeEqual } = require('node:crypto');

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function isAuthorized(req) {
  const expected = process.env.SYNC_PASSWORD;
  const authorization = req.headers.authorization || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.SYNC_PASSWORD) {
    throw new Error('Vercel environment variables are not configured.');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

async function supabaseRequest(config, method, body) {
  const query = method === 'GET' ? '?id=eq.1&select=entries' : '?on_conflict=id';
  const url = `${config.url}/rest/v1/balance_history${query}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: 'application/json',
      ...(body ? {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return method === 'GET' ? response.json() : null;
}

function validEntries(entries) {
  return Array.isArray(entries) && entries.every(entry =>
    entry &&
    Number.isSafeInteger(entry.id) &&
    typeof entry.d === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.d) &&
    Number.isFinite(entry.b) &&
    typeof (entry.n ?? '') === 'string' &&
    (entry.n ?? '').length <= 50
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return respond(res, 405, { error: 'Method not allowed.' });
  }
  if (!isAuthorized(req)) return respond(res, 401, { error: 'Invalid sync password.' });

  try {
    const config = configuration();
    if (req.method === 'GET') {
      const rows = await supabaseRequest(config, 'GET');
      if (!Array.isArray(rows) || (rows.length && !validEntries(rows[0].entries))) {
        throw new Error('Supabase returned an invalid balance history.');
      }
      return respond(res, 200, { entries: rows.length ? rows[0].entries : [] });
    }
    if (!req.body || !validEntries(req.body.entries)) {
      return respond(res, 400, { error: 'Invalid balance history.' });
    }
    await supabaseRequest(config, 'POST', { id: 1, entries: req.body.entries, updated_at: new Date().toISOString() });
    return respond(res, 200, { ok: true });
  } catch (error) {
    console.error('Balance history sync failed:', error);
    return respond(res, 502, { error: error.message });
  }
};
