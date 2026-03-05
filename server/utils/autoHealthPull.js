const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

function normalizePayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return { samples: parsed };
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.samples)) return { samples: parsed.samples };
      if (typeof parsed.csv === 'string') return { csv: parsed.csv };
    }
    return null;
  } catch (_) {
    // Not JSON, fall back to CSV text.
    if (/sourcename|source name|startdate|start date/i.test(trimmed.slice(0, 300))) {
      return { csv: trimmed };
    }
    return { csv: trimmed };
  }
}

function buildSourceHeaders() {
  const headers = {};
  if (process.env.AUTO_PULL_SOURCE_AUTH_BEARER) {
    headers.Authorization = `Bearer ${process.env.AUTO_PULL_SOURCE_AUTH_BEARER}`;
  }
  if (process.env.AUTO_PULL_SOURCE_HEADER_NAME && process.env.AUTO_PULL_SOURCE_HEADER_VALUE) {
    headers[process.env.AUTO_PULL_SOURCE_HEADER_NAME] = process.env.AUTO_PULL_SOURCE_HEADER_VALUE;
  }
  return headers;
}

function getIntervalMs() {
  const n = parseInt(process.env.AUTO_PULL_INTERVAL_MINUTES || '15', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MS;
  return n * 60 * 1000;
}

function shouldRun() {
  return (
    process.env.AUTO_PULL_ENABLED === 'true' &&
    !!process.env.AUTO_PULL_SOURCE_URL &&
    !!process.env.AUTO_PULL_INGEST_KEY
  );
}

function startAutoHealthPull({ port }) {
  if (!shouldRun()) {
    console.log('[auto-pull] disabled (set AUTO_PULL_ENABLED=true plus source URL and ingest key)');
    return;
  }

  const sourceUrl = process.env.AUTO_PULL_SOURCE_URL;
  const ingestKey = process.env.AUTO_PULL_INGEST_KEY;
  const localImportUrl = `http://127.0.0.1:${port}/api/health/import`;
  const intervalMs = getIntervalMs();

  let running = false;

  const runOnce = async () => {
    if (running) {
      console.log('[auto-pull] skipped (previous run still in progress)');
      return;
    }
    running = true;
    try {
      const sourceRes = await fetch(sourceUrl, { headers: buildSourceHeaders() });
      if (!sourceRes.ok) {
        const txt = await sourceRes.text();
        console.error('[auto-pull] source fetch failed:', sourceRes.status, txt.slice(0, 500));
        return;
      }

      const sourceText = await sourceRes.text();
      const payload = normalizePayload(sourceText);
      if (!payload) {
        console.warn('[auto-pull] source payload empty/unsupported');
        return;
      }

      const importRes = await fetch(localImportUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-INGEST-KEY': ingestKey,
        },
        body: JSON.stringify(payload),
      });

      const importText = await importRes.text();
      if (!importRes.ok) {
        console.error('[auto-pull] import failed:', importRes.status, importText.slice(0, 500));
        return;
      }

      console.log('[auto-pull] import success:', importText.slice(0, 300));
    } catch (err) {
      console.error('[auto-pull] run failed:', err.message);
    } finally {
      running = false;
    }
  };

  console.log(`[auto-pull] enabled: every ${Math.round(intervalMs / 60000)} min from ${sourceUrl}`);

  // Kick once on startup, then every interval.
  runOnce();
  setInterval(runOnce, intervalMs);
}

module.exports = { startAutoHealthPull };
