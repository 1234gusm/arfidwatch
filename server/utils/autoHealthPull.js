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

// ── Health Auto Export REST API normalisation helpers ─────────────────────────
const HK_PREFIX_RE = /^HK(?:Quantity|Category|Characteristic)TypeIdentifier/i;

function hkNameToSnake(name) {
  const stripped = String(name).replace(HK_PREFIX_RE, '');
  return stripped
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeHAEUnit(units) {
  if (!units) return '';
  return String(units).toLowerCase()
    .replace(/[\[\]()\.\u00B7\u22C5\u2022\/]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const HAE_TYPE_REMAP = {
  basal_energy_burned_kcal:           'resting_energy_kcal',
  basal_energy_burned:                'resting_energy_kcal',
  body_mass_lb:                       'weight_lb',
  body_mass_kg:                       'weight_kg',
  body_mass_pounds:                   'weight_lb',
  body_mass:                          'weight_lb',
  heart_rate_bpm:                     'heart_rate_avg_countmin',
  heart_rate:                         'heart_rate_avg_countmin',
  resting_heart_rate_bpm:             'resting_heart_rate_countmin',
  heart_rate_variability_sdnn_ms:     'heart_rate_variability_ms',
  heart_rate_variability_sdnn:        'heart_rate_variability_ms',
  walking_heart_rate_average_bpm:     'walking_heart_rate_average_countmin',
  cardio_fitness_mlkgmin:             'vo2_max_mlkgmin',
  cardio_fitness_mlkg_min:            'vo2_max_mlkgmin',
  cardio_fitness:                     'vo2_max_mlkgmin',
  vo2_max_mlkg_min:                   'vo2_max_mlkgmin',
  dietary_fat_total_g:                'total_fat_g',
  dietary_fat_total:                  'total_fat_g',
  dietary_carbohydrates_g:            'carbohydrates_g',
  dietary_carbohydrates:              'carbohydrates_g',
  dietary_protein_g:                  'protein_g',
  dietary_protein:                    'protein_g',
  dietary_fiber_g:                    'fiber_g',
  dietary_fiber:                      'fiber_g',
  dietary_sugar_g:                    'sugar_g',
  dietary_sugar:                      'sugar_g',
  dietary_sodium_mg:                  'sodium_mg',
  dietary_sodium:                     'sodium_mg',
  dietary_fat_saturated_g:            'saturated_fat_g',
  dietary_fat_polyunsaturated_g:      'polyunsaturated_fat_g',
  dietary_fat_monounsaturated_g:      'monounsaturated_fat_g',
  dietary_cholesterol_mg:             'cholesterol_mg',
  dietary_potassium_mg:               'potassium_mg',
  dietary_calcium_mg:                 'calcium_mg',
  dietary_magnesium_mg:               'magnesium_mg',
  dietary_iron_mg:                    'iron_mg',
  dietary_zinc_mg:                    'zinc_mg',
  dietary_vitamin_a_mcg:              'vitamin_a_mcg',
  dietary_vitamin_b12_mcg:            'vitamin_b12_mcg',
  dietary_vitamin_b6_mg:              'vitamin_b6_mg',
  dietary_vitamin_c_mg:               'vitamin_c_mg',
  dietary_vitamin_d_mcg:              'vitamin_d_mcg',
  dietary_vitamin_e_mg:               'vitamin_e_mg',
  dietary_vitamin_k_mcg:              'vitamin_k_mcg',
  dietary_caffeine_mg:                'caffeine_mg',
  dietary_water_fl__oz:               'water_fl_oz_us',
  dietary_water_fl_oz:                'water_fl_oz_us',
  dietary_water:                      'water_fl_oz_us',
  dietary_chromium_mcg:               'chromium_mcg',
  dietary_copper_mg:                  'copper_mg',
  dietary_iodine_mcg:                 'iodine_mcg',
  dietary_manganese_mg:               'manganese_mg',
  dietary_molybdenum_mcg:             'molybdenum_mcg',
  dietary_selenium_mcg:               'selenium_mcg',
  dietary_pantothenic_acid_mg:        'pantothenic_acid_mg',
  dietary_niacin_mg:                  'niacin_mg',
  dietary_riboflavin_mg:              'riboflavin_mg',
  dietary_thiamin_mg:                 'thiamin_mg',
  dietary_biotin_mcg:                 'biotin_mcg',
  dietary_folate_mcg:                 'folate_mcg',
  stair_ascent_speed_fts:             'stair_speed__up_fts',
  stair_ascent_speed:                 'stair_speed__up_fts',
  stair_descent_speed_fts:            'stair_speed__down_fts',
  stair_descent_speed:                'stair_speed__down_fts',
  six_minute_walk_test_distance_m:    'six_minute_walking_test_distance_m',
  six_minute_walking_distance_m:      'six_minute_walking_test_distance_m',
  lean_body_mass_kg:                  'lean_body_mass_lb',
};

// Flatten a HAE REST API metrics array into flat { type, value, timestamp } samples.
function flattenHAEMetrics(metrics) {
  const samples = [];
  if (!Array.isArray(metrics)) return samples;
  for (const metric of metrics) {
    if (!metric || !Array.isArray(metric.data)) continue;
    const rawName = String(metric.name || '');
    if (!rawName) continue;
    if (/sleep_analysis|SleepAnalysis/i.test(rawName)) continue;
    const baseName = hkNameToSnake(rawName);
    if (!baseName) continue;
    const unitSuffix = normalizeHAEUnit(metric.units || '');
    const constructed = unitSuffix ? `${baseName}_${unitSuffix}` : baseName;
    const typeKey = HAE_TYPE_REMAP[constructed] || HAE_TYPE_REMAP[baseName] || constructed;
    for (const entry of metric.data) {
      const date = entry.date || entry.startDate || entry.endDate;
      if (!date) continue;
      const value = entry.qty != null ? entry.qty
        : entry.Avg != null ? entry.Avg
        : entry.average != null ? entry.average
        : entry.Sum != null ? entry.Sum
        : entry.sum != null ? entry.sum
        : entry.value != null ? entry.value
        : null;
      if (value == null) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      samples.push({ type: typeKey, value: num, timestamp: String(date) });
    }
  }
  return samples;
}

function normalizePayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return { samples: parsed };
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.samples)) return { samples: parsed.samples };
      if (typeof parsed.csv === 'string') return { csv: parsed.csv };
      // Health Auto Export REST API: { data: { metrics: [...] } } or { metrics: [...] }
      const metricsArr = (parsed.data && Array.isArray(parsed.data.metrics)) ? parsed.data.metrics
        : Array.isArray(parsed.metrics) ? parsed.metrics : null;
      if (metricsArr) {
        const samples = flattenHAEMetrics(metricsArr);
        if (samples.length > 0) return { samples };
      }
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
  flattenHAEMetrics,
};
