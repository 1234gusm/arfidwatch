const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const state = {
  configured: false,
  enabled: false,
  running: false,
  started: false,
  interval_minutes: 15,
  source_url: null,
  last_run_at: null,
  last_success_at: null,
  last_error: null,
  last_result: null,
};

const runtime = {
  runOnce: null,
  timer: null,
};

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
  const bearer = process.env.AUTO_PULL_SOURCE_AUTH_BEARER
    || process.env.HEALTH_AUTO_EXPORT_AUTH_BEARER
    || process.env.HEALTH_AUTO_EXPORT_REST_API_BEARER;
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const headerName = process.env.AUTO_PULL_SOURCE_HEADER_NAME || process.env.HEALTH_AUTO_EXPORT_HEADER_NAME;
  const headerValue = process.env.AUTO_PULL_SOURCE_HEADER_VALUE || process.env.HEALTH_AUTO_EXPORT_HEADER_VALUE;
  if (headerName && headerValue) {
    headers[headerName] = headerValue;
  }
  return headers;
}

function getIntervalMs() {
  const n = parseInt(process.env.AUTO_PULL_INTERVAL_MINUTES || '15', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MS;
  return n * 60 * 1000;
}

function getSourceUrl() {
  return process.env.AUTO_PULL_SOURCE_URL
    || process.env.HEALTH_AUTO_EXPORT_API_URL
    || process.env.HEALTH_AUTO_EXPORT_REST_API_URL
    || null;
}

function getIngestKey() {
  return process.env.AUTO_PULL_INGEST_KEY
    || process.env.HEALTH_AUTO_EXPORT_INGEST_KEY
    || null;
}

function isEnabledFlag() {
  return process.env.AUTO_PULL_ENABLED === 'true';
}

function shouldRun() {
  return isEnabledFlag() && !!getSourceUrl() && !!getIngestKey();
}

function getAutoHealthPullStatus() {
  return { ...state };
}

async function triggerAutoHealthPullNow() {
  if (!runtime.runOnce) {
    return { ok: false, error: 'auto pull not initialized' };
  }
  return runtime.runOnce({ manual: true });
}

function startAutoHealthPull({ port }) {
  const sourceUrl = getSourceUrl();
  const ingestKey = getIngestKey();
  const configured = !!sourceUrl && !!ingestKey;
  state.configured = configured;
  state.enabled = shouldRun();
  state.interval_minutes = Math.round(getIntervalMs() / 60000);
  state.source_url = sourceUrl;

  if (!configured) {
    state.last_error = null;
    console.log('[auto-pull] not configured (missing source URL or ingest key)');
    return;
  }

  const localImportUrl = `http://127.0.0.1:${port}/api/health/import`;
  const intervalMs = getIntervalMs();

  const runOnce = async ({ manual = false } = {}) => {
    if (state.running) {
      console.log('[auto-pull] skipped (previous run still in progress)');
      return { ok: false, error: 'already running' };
    }
    state.running = true;
    state.last_run_at = new Date().toISOString();
    state.last_error = null;
    try {
      const sourceRes = await fetch(sourceUrl, { headers: buildSourceHeaders() });
      if (!sourceRes.ok) {
        const txt = await sourceRes.text();
        const msg = `source fetch failed (${sourceRes.status})`;
        state.last_error = `${msg}: ${txt.slice(0, 500)}`;
        console.error('[auto-pull]', state.last_error);
        return { ok: false, error: msg };
      }

      const sourceText = await sourceRes.text();
      const payload = normalizePayload(sourceText);
      if (!payload) {
        state.last_error = 'source payload empty/unsupported';
        console.warn('[auto-pull]', state.last_error);
        return { ok: false, error: state.last_error };
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
        const msg = `import failed (${importRes.status})`;
        state.last_error = `${msg}: ${importText.slice(0, 500)}`;
        console.error('[auto-pull]', state.last_error);
        return { ok: false, error: msg };
      }

      let parsed = null;
      try { parsed = JSON.parse(importText); } catch (_) { parsed = null; }
      state.last_success_at = new Date().toISOString();
      state.last_result = parsed || { raw: importText.slice(0, 300) };
      console.log('[auto-pull] import success:', importText.slice(0, 300));
      return { ok: true, manual, result: state.last_result };
    } catch (err) {
      state.last_error = err.message;
      console.error('[auto-pull] run failed:', err.message);
      return { ok: false, error: err.message };
    } finally {
      state.running = false;
    }
  };

  runtime.runOnce = runOnce;
  state.started = true;

  if (!isEnabledFlag()) {
    console.log('[auto-pull] scheduler disabled; manual pull is available');
    return;
  }

  console.log(`[auto-pull] enabled: every ${Math.round(intervalMs / 60000)} min from ${sourceUrl}`);

  // Kick once on startup, then every interval.
  runOnce({ manual: false });
  if (runtime.timer) clearInterval(runtime.timer);
  runtime.timer = setInterval(() => runOnce({ manual: false }), intervalMs);
}

module.exports = {
  startAutoHealthPull,
  triggerAutoHealthPullNow,
  getAutoHealthPullStatus,
};
