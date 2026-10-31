(() => {
  const passwordKey = 'mtSyncPassword';

  async function request(password, method, entries) {
    const response = await fetch('/api/history', {
      method,
      headers: {
        Authorization: `Bearer ${password}`,
        ...(entries ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(entries ? { body: JSON.stringify({ entries }) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Sync request failed (${response.status}).`);
    return result;
  }

  async function connect(password, localEntries, applyRemote, status) {
    if (!password) throw new Error('Enter your sync password first.');
    status('Connecting to GitHub…');
    const result = await request(password, 'GET');
    sessionStorage.setItem(passwordKey, password);
    if (result.entries.length) {
      applyRemote(result.entries);
      status('Loaded the GitHub history.');
    } else if (localEntries.length) {
      await request(password, 'PUT', localEntries);
      status('Uploaded this browser’s history to GitHub.');
    } else {
      status('Connected. Your history will be saved to GitHub.');
    }
  }

  async function save(entries, status) {
    const password = sessionStorage.getItem(passwordKey);
    if (!password) return;
    try {
      await request(password, 'PUT', entries);
      status('Saved to GitHub.');
    } catch (error) {
      status(`GitHub sync failed; your browser copy is kept. ${error.message}`);
    }
  }

  window.BalanceSync = { connect, save, savedPassword: () => sessionStorage.getItem(passwordKey) || '' };
})();
