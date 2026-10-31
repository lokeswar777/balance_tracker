const { timingSafeEqual } = require('node:crypto');

const githubApi = 'https://api.github.com';
const defaultPath = 'data/balance-history.json';

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
  const { GITHUB_TOKEN: token, GITHUB_OWNER: owner, GITHUB_REPO: repo } = process.env;
  if (!token || !owner || !repo || !process.env.SYNC_PASSWORD) {
    throw new Error('Vercel environment variables are not configured.');
  }
  return {
    token,
    owner,
    repo,
    path: process.env.GITHUB_FILE_PATH || defaultPath,
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

async function githubRequest(config, method, path, body) {
  const response = await fetch(`${githubApi}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (response.status === 404 && method === 'GET') return null;
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }
  return response.json();
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

async function readHistory(config) {
  const file = await githubRequest(config, 'GET', config.path);
  if (!file) return [];
  try {
    const parsed = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (!parsed || !validEntries(parsed.entries)) throw new Error('Invalid history file format.');
    return parsed.entries;
  } catch (error) {
    throw new Error(`Could not read the GitHub history file: ${error.message}`);
  }
}

async function writeHistory(config, entries) {
  const file = await githubRequest(config, 'GET', config.path);
  const contents = Buffer.from(`${JSON.stringify({ entries }, null, 2)}\n`, 'utf8').toString('base64');
  await githubRequest(config, 'PUT', config.path, {
    message: 'Update balance history',
    content: contents,
    ...(file ? { sha: file.sha } : {}),
    branch: config.branch,
  });
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
      return respond(res, 200, { entries: await readHistory(config) });
    }
    if (!req.body || !validEntries(req.body.entries)) {
      return respond(res, 400, { error: 'Invalid balance history.' });
    }
    await writeHistory(config, req.body.entries);
    return respond(res, 200, { ok: true });
  } catch (error) {
    console.error('Balance history sync failed:', error);
    return respond(res, 502, { error: error.message });
  }
};
