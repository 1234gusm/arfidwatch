const express = require('express');
const db = require('../db');
const multer = require('multer');
const exceljs = require('exceljs');
const { triggerAutoHealthPullNow, getAutoHealthPullStatus } = require('../utils/autoHealthPull');
const path = require('path');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const crypto = require('crypto');
const rawTextParser = express.text({ type: ['text/*', 'application/csv', 'application/octet-stream'], limit: '10mb' });

const hashIngestKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

const resolveImportFilename = (fallback, ...candidates) => {
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const clean = path.basename(raw).replace(/\0/g, '');
    if (clean) return clean;
  }
  return fallback;
};

async function authenticateOrIngestKey(req, res, next) {
  const auth = req.headers.authorization;
  if (auth) {
    return authenticate(req, res, async (err) => {
      if (err) return;
      return next();
    });
  }

  const ingestKey = req.headers['x-ingest-key'];
  if (!ingestKey) {
    return res.status(401).json({ error: 'missing token or x-ingest-key header' });
  }

  try {
    const keyHash = hashIngestKey(ingestKey);
    const profile = await db('user_profiles')
      .where({ ingest_key_hash: keyHash })
      .select('user_id')
      .first();

    if (!profile) return res.status(401).json({ error: 'invalid ingest key' });

    req.user = { id: profile.user_id, type: 'ingest_key' };
    await db('user_profiles')
      .where({ user_id: profile.user_id })
      .update({ ingest_key_last_used_at: new Date().toISOString() });
    return next();
  } catch (e) {
    return res.status(500).json({ error: 'ingest key auth failed' });
  }
}

const normalizeStatTimestamp = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const normalizeStatValue = (v) => {
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '') return n;
  return String(v ?? '').trim();
};

const statKey = (r) => `${r.type}|${normalizeStatTimestamp(r.timestamp)}|${String(normalizeStatValue(r.value))}`;
const CHUNK_SIZE = 200;

const normalizeCsvHeader = (h) => String(h || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[^a-z0-9 ]/g, '');

const parseDurationHours = (value) => {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) {
    const h = Number(hhmm[1]) || 0;
    const m = Number(hhmm[2]) || 0;
    const s = Number(hhmm[3]) || 0;
    return h + (m / 60) + (s / 3600);
  }

  const hm = raw.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(\d+(?:\.\d+)?)?\s*m?/);
  if (hm) {
    const h = Number(hm[1]) || 0;
    const m = Number(hm[2]) || 0;
    return h + (m / 60);
  }

  const mins = raw.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)$/);
  if (mins) {
    return (Number(mins[1]) || 0) / 60;
  }

  const n = Number(raw.replace(/[^0-9eE+\-.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  // Values in minutes are occasionally exported for sleep durations.
  if (n > 24 && n <= 1440) return n / 60;
  return n;
};

const isAutoSleepCsvHeaders = (headers = []) => {
  const hs = headers.map(normalizeCsvHeader).filter(Boolean);
  if (!hs.length) return false;

  const hasAutoSleepWord = hs.some(h => h.includes('autosleep'));
  if (hasAutoSleepWord) return true;

  // AutoSleep-specific headers that don't appear in other health exports
  const autoSleepSpecific = [
    hs.some(h => h === 'iso8601'),
    hs.some(h => h === 'fromdate' || h === 'todate'),
    hs.some(h => h === 'inbed'),
    hs.some(h => h === 'fellasleepin'),
    hs.some(h => h === 'asleepavg7' || h === 'efficiencyavg7' || h === 'qualityavg7' || h === 'deepavg7'),
  ].filter(Boolean).length;

  return autoSleepSpecific >= 2;
};

const pickRowValue = (row, testFn) => {
  for (const [k, v] of Object.entries(row || {})) {
    if (testFn(normalizeCsvHeader(k))) return v;
  }
  return null;
};

const pickRowValueByHeaders = (row, headerNames = []) => {
  const wanted = new Set(headerNames.map(h => normalizeCsvHeader(h)));
  for (const [k, v] of Object.entries(row || {})) {
    if (wanted.has(normalizeCsvHeader(k))) return v;
  }
  return null;
};

const MONTH_MAP = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const parseDateOnlyLocal = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Handle full datetime strings by anchoring to the literal date portion.
  const isoDatePrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoDatePrefix) {
    const y = Number(isoDatePrefix[1]);
    const m = Number(isoDatePrefix[2]) - 1;
    const d = Number(isoDatePrefix[3]);
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const m = Number(us[1]) - 1;
    const d = Number(us[2]);
    const y = Number(us[3]);
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  // Human-readable: "Friday, Mar 6, 2026" or "Mar 6, 2026" or "February 14, 2026"
  const human = raw.match(/^(?:\w+,\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (human) {
    const m = MONTH_MAP[human[1].toLowerCase().slice(0, 3)];
    const d = Number(human[2]);
    const y = Number(human[3]);
    if (m != null) return new Date(y, m, d, 12, 0, 0, 0);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(12, 0, 0, 0);
  return parsed;
};

const autosleepTimestamp = (row) => {
  const toDateVal =
    pickRowValueByHeaders(row, ['toDate']) ||
    pickRowValue(row, h => h === 'todate');
  const fallbackDateVal =
    pickRowValueByHeaders(row, ['ISO8601', 'date', 'sleep date', 'day', 'fromDate']) ||
    pickRowValue(row, h => h === 'iso8601' || h === 'date' || h.includes('sleep date') || h === 'day' || h === 'fromdate');

  const d = parseDateOnlyLocal(toDateVal || fallbackDateVal);
  if (!d) return new Date().toISOString();
  return d.toISOString();
};

const buildAutoSleepRecords = (rows, userId) => {
  // Duration-based fields (HH:MM:SS → decimal hours)
  const durationMetrics = [
    { type: 'sleep_analysis_total_sleep_hr', match: h => h === 'asleep' || h.includes('total sleep') || h.includes('time asleep') },
    { type: 'sleep_analysis_in_bed_hr',      match: h => h === 'inbed' || h.includes('in bed') || h.includes('time in bed') },
    { type: 'sleep_analysis_deep_hr',        match: h => h === 'deep' || h.includes('deep sleep') },
    { type: 'sleep_analysis_rem_hr',         match: h => h === 'rem' || h.includes('rem sleep') },
    { type: 'sleep_analysis_awake_hr',       match: h => h === 'awake' || h.includes('time awake') || h === 'wake' },
    { type: 'sleep_analysis_quality_hr',     match: h => h === 'quality' },
    { type: 'fell_asleep_in_hr',             match: h => h === 'fellasleepin' || h.includes('fell asleep in') },
  ];

  // Numeric fields (stored as-is, no unit conversion)
  const numericMetrics = [
    { type: 'sleep_efficiency_percent',      match: h => h === 'efficiency' },
    { type: 'sleep_sessions_count',          match: h => h === 'sessions' },
    { type: 'sleep_heart_rate_bpm',          match: h => h === 'sleepbpm' || h === 'sleep bpm' },
    { type: 'waking_heart_rate_bpm',         match: h => h === 'wakingbpm' || h === 'waking bpm' },
    { type: 'day_heart_rate_bpm',            match: h => h === 'daybpm' || h === 'day bpm' },
    { type: 'heart_rate_variability_ms',     match: h => h === 'hrv' },
    { type: 'sleep_hrv_ms',                  match: h => h === 'sleephrv' || h === 'sleep hrv' },
    { type: 'blood_oxygen_saturation__',     match: h => h === 'spo2avg' },
    { type: 'blood_oxygen_min__',            match: h => h === 'spo2min' },
    { type: 'blood_oxygen_max__',            match: h => h === 'spo2max' },
    { type: 'respiratory_rate_countmin',     match: h => h === 'respavg' || h === 'resp avg' },
    { type: 'resp_rate_min_countmin',        match: h => h === 'respmin' || h === 'resp min' },
    { type: 'resp_rate_max_countmin',        match: h => h === 'respmax' || h === 'resp max' },
    { type: 'breathing_disturbances_count',  match: h => h === 'apnea' },
  ];

  const out = [];
  rows.forEach((row, idx) => {
    const ts = autosleepTimestamp(row);

    durationMetrics.forEach((m) => {
      const rawVal = pickRowValue(row, m.match);
      const value = parseDurationHours(rawVal);
      if (value == null) return;
      out.push({ user_id: userId, type: m.type, value, timestamp: ts, raw: JSON.stringify({ source: 'autosleep_csv', row: idx + 2, value: rawVal }) });
    });

    numericMetrics.forEach((m) => {
      const rawVal = pickRowValue(row, m.match);
      if (rawVal == null || String(rawVal).trim() === '') return;
      const value = parseFloat(String(rawVal).replace(/[^0-9eE+\-.]/g, ''));
      if (!Number.isFinite(value)) return;
      out.push({ user_id: userId, type: m.type, value, timestamp: ts, raw: JSON.stringify({ source: 'autosleep_csv', row: idx + 2, value: rawVal }) });
    });
  });

  return out;
};

const SLEEP_BASE_TYPES = new Set([
  'sleep_analysis_total_sleep_hr',
  'sleep_analysis_asleep_hr',
  'sleep_analysis_in_bed_hr',
  'sleep_analysis_core_hr',
  'sleep_analysis_rem_hr',
  'sleep_analysis_deep_hr',
  'sleep_analysis_awake_hr',
  'sleep_analysis_quality_hr',
]);

const canonicalSleepType = (rawType) => {
  const t = String(rawType || '');
  const base = t.startsWith('macrofactor_') ? t.slice('macrofactor_'.length) : t;
  return SLEEP_BASE_TYPES.has(base) ? base : null;
};

const sleepHours = (type, value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (!String(type).endsWith('_hr')) return n;

  // Uploaded sleep can mix hours/minutes/seconds under *_hr labels.
  if (n > 240) return n / 3600;
  if (n > 24) return n / 60;
  return n;
};

const dayKeyWithOffset = (isoTimestamp, offsetMinutes = 0) => {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() - offsetMinutes * 60000);
  return shifted.toISOString().slice(0, 10);
};

const insertInChunks = async (tableName, rows, chunkSize = CHUNK_SIZE) => {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db(tableName).insert(rows.slice(i, i + chunkSize));
  }
};

// Remove duplicate stats both within the incoming upload and against existing
// stored rows for the same user.
const filterDuplicateStats = async (userId, inputRecords) => {
  if (!inputRecords.length) return [];

  const uploadRecords = [];
  const seenInUpload = new Set();
  for (const rec of inputRecords) {
    const ts = normalizeStatTimestamp(rec.timestamp);
    if (!ts) continue;
    const normalized = { ...rec, timestamp: ts, value: normalizeStatValue(rec.value) };
    const key = statKey(normalized);
    if (seenInUpload.has(key)) continue;
    seenInUpload.add(key);
    uploadRecords.push(normalized);
  }
  if (!uploadRecords.length) return [];

  // For sleep records, dedupe by night/day+type (not exact value+timestamp)
  // so repeated exports keep one record per metric per night.
  const nonSleepUpload = [];
  const sleepLatestByNight = new Map();
  for (const rec of uploadRecords) {
    const sleepType = canonicalSleepType(rec.type);
    if (!sleepType) {
      nonSleepUpload.push(rec);
      continue;
    }
    const nightKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
    const prev = sleepLatestByNight.get(nightKey);
    if (!prev || String(rec.timestamp) > String(prev.timestamp)) {
      sleepLatestByNight.set(nightKey, rec);
    }
  }
  const normalizedUpload = [...nonSleepUpload, ...sleepLatestByNight.values()];
  if (!normalizedUpload.length) return [];

  const types = new Set();
  for (const r of normalizedUpload) {
    types.add(r.type);
    const sleepType = canonicalSleepType(r.type);
    if (sleepType) {
      types.add(sleepType);
      types.add(`macrofactor_${sleepType}`);
    }
  }
  let minTs = normalizedUpload[0].timestamp;
  let maxTs = normalizedUpload[0].timestamp;
  for (let i = 1; i < normalizedUpload.length; i += 1) {
    const ts = normalizedUpload[i].timestamp;
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;
  }

  const existing = await db('health_data')
    .select('type', 'timestamp', 'value')
    .where({ user_id: userId })
    .whereIn('type', [...types])
    .andWhere('timestamp', '>=', minTs)
    .andWhere('timestamp', '<=', maxTs);

  const existingKeyCounts = new Map();
  for (const row of existing) {
    const key = statKey(row);
    existingKeyCounts.set(key, (existingKeyCounts.get(key) || 0) + 1);
  }

  const existingSleepNights = new Set();
  for (const row of existing) {
    const sleepType = canonicalSleepType(row.type);
    if (!sleepType) continue;
    existingSleepNights.add(`${sleepType}|${String(row.timestamp).slice(0, 10)}`);
  }

  const replacedSleepNights = new Set();

  // Remove anything that already exists in storage.
  const keep = [];
  for (const rec of normalizedUpload) {
    const sleepType = canonicalSleepType(rec.type);
    if (sleepType) {
      const nightKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
      if (existingSleepNights.has(nightKey)) {
        const deleteKey = `${sleepType}|${String(rec.timestamp).slice(0, 10)}`;
        if (!replacedSleepNights.has(deleteKey)) {
          const day = String(rec.timestamp).slice(0, 10);
          await db('health_data')
            .where({ user_id: userId })
            .whereIn('type', [sleepType, `macrofactor_${sleepType}`])
            .andWhereRaw('substr(timestamp, 1, 10) = ?', [day])
            .delete();
          replacedSleepNights.add(deleteKey);
        }
      }
      keep.push(rec);
      continue;
    }

    const key = statKey(rec);
    const existingCount = existingKeyCounts.get(key) || 0;
    if (existingCount > 0) {
      existingKeyCounts.set(key, existingCount - 1);
      continue;
    }
    keep.push(rec);
  }
  return keep;
};

// import health data from Health Auto Export JSON
router.post('/import', rawTextParser, authenticateOrIngestKey, async (req, res) => {
  const rawBodyText = typeof req.body === 'string' ? req.body : null;
  const jsonBody = req.body && typeof req.body === 'object' ? req.body : {};
  const uploadFilename = resolveImportFilename(
    'ArfidWatch Import',
    jsonBody.filename,
    req.headers['x-upload-filename'],
    req.headers['x-file-name'],
  );

  // Health Auto Export and automation tools can post one of several shapes:
  // - array of samples
  // - { samples: [...] }
  // - { data: [...] } / { records: [...] }
  const sampleArray = Array.isArray(req.body)
    ? req.body
    : (Array.isArray(jsonBody.samples)
      ? jsonBody.samples
      : (Array.isArray(jsonBody.data)
        ? jsonBody.data
        : (Array.isArray(jsonBody.records) ? jsonBody.records : null)));

  // accept either samples array (from JSON) or csv string
  if (sampleArray) {
    const samples = sampleArray;
    const records = samples.map(s => ({
      user_id: req.user.id,
      type: s.type || s.dataType || s.name,
      value: s.value,
      timestamp: s.startDate || s.timestamp || s.date,
      raw: JSON.stringify(s),
    })).filter(r => r.type && r.timestamp && r.value !== undefined && r.value !== null
      && !/^sleep_analysis_/i.test(String(r.type)));
    const deduped = await filterDuplicateStats(req.user.id, records);
    if (deduped.length) await insertInChunks('health_data', deduped);
    return res.json({ imported: deduped.length, skipped_duplicates: records.length - deduped.length });
  } else if (jsonBody.csv || rawBodyText) {
    const csvText = jsonBody.csv || rawBodyText;
    let fileHash = null;
    let duplicateFile = false;
    try {
      fileHash = crypto.createHash('sha256').update(csvText).digest('hex');
      const sameHashImport = await db('health_imports')
        .where({ user_id: req.user.id, source: 'health', file_hash: fileHash })
        .first();
      duplicateFile = !!sameHashImport;
    } catch (e) {
      // Hash/duplicate detection should never block imports.
      console.warn('health csv hash/duplicate check failed:', e.message);
    }
    try {
      // use csv-parse sync to get structured rows (columns: true)
      const { parse } = require('csv-parse/sync');
      // allow rows with missing/extra columns (relax_column_count)
      // trim values and skip empty lines for robustness
      const rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      });
      const headers = rows.length ? Object.keys(rows[0]) : [];
      const isAutoSleep = isAutoSleepCsvHeaders(headers);
      const records = [];

      if (isAutoSleep) {
        records.push(...buildAutoSleepRecords(rows, req.user.id));
      }

      const tsCandidates = ['startDate', 'endDate', 'timestamp', 'date', 'time'];

      for (const row of rows) {
        if (isAutoSleep) continue;
        // find a timestamp field in the row
        let ts = null;
        for (const k of Object.keys(row)) {
          if (tsCandidates.includes(k) || /date|time|timestamp/i.test(k)) {
            const v = row[k];
            if (v) {
              const d = new Date(v);
              if (!isNaN(d.getTime())) { ts = d.toISOString(); break; }
            }
          }
        }
        if (!ts) ts = new Date().toISOString();

        // for every column except timestamp-like, create a metric record
        for (const [k, v] of Object.entries(row)) {
          if (!k) continue;
          if (/^\s*$/i.test(k)) continue;
          if (/date|time|timestamp/i.test(k)) continue;
          if (v === undefined || v === null || String(v).trim() === '') continue;

          // normalize type key — strip brackets, parens, dots, slashes, and
          // Unicode punctuation like the middle-dot (·, U+00B7) used in units
          // such as "ml/(kg·min)" so the key matches the typeMeta/SECTIONS keys.
          const typeKey = String(k).trim().toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[\[\]()\./\u00B7\u22C5\u2022]/g, '')
            .replace(/[^a-z0-9_]/g, '_');

          // Skip sleep data from Health Auto Export — only AutoSleep CSV should provide sleep
          if (/^sleep_analysis_/i.test(typeKey)) continue;

          const num = parseFloat(String(v).replace(/[^0-9eE+\-.]/g, ''));
          const value = Number.isFinite(num) ? num : String(v);

          records.push({
            user_id: req.user.id,
            type: typeKey,
            value,
            timestamp: ts,
            raw: JSON.stringify({ column: k, value: v }),
          });
        }
      }

      let deduped = records;
      try {
        if (isAutoSleep) {
          // AutoSleep exports are nightly snapshots; replace nights present in
          // this upload so corrected values always win over prior shifted rows.
          const normalized = [];
          const seenUpload = new Set();
          for (const rec of records) {
            const ts = normalizeStatTimestamp(rec.timestamp);
            if (!ts) continue;
            const normalizedRec = { ...rec, timestamp: ts, value: normalizeStatValue(rec.value) };
            const key = statKey(normalizedRec);
            if (seenUpload.has(key)) continue;
            seenUpload.add(key);
            normalized.push(normalizedRec);
          }

          // Delete all existing records for each type+night in this upload so
          // re-imports always win with the latest values from AutoSleep.
          const nightTypeMap = new Map(); // day → Set<type>
          for (const rec of normalized) {
            const day = String(rec.timestamp).slice(0, 10);
            if (!nightTypeMap.has(day)) nightTypeMap.set(day, new Set());
            nightTypeMap.get(day).add(rec.type);
            const sleepAlias = canonicalSleepType(rec.type);
            if (sleepAlias && sleepAlias !== rec.type) nightTypeMap.get(day).add(`macrofactor_${sleepAlias}`);
          }

          for (const [day, types] of nightTypeMap) {
            await db('health_data')
              .where({ user_id: req.user.id })
              .whereIn('type', [...types])
              .andWhereRaw('substr(timestamp, 1, 10) = ?', [day])
              .delete();
          }

          deduped = normalized;
        } else {
          deduped = await filterDuplicateStats(req.user.id, records);
        }
      } catch (e) {
        // Dedupe should be best-effort; preserve upload ability on any failure.
        console.warn('health csv dedupe failed, importing raw rows:', e.message);
      }
      if (deduped.length > 0) {
        // Create an import tracking record first
        const importRow = {
          user_id: req.user.id,
          filename: uploadFilename,
          source: 'health',
          imported_at: new Date().toISOString(),
          record_count: deduped.length,
        };
        if (fileHash) importRow.file_hash = fileHash;

        let importId;
        try {
          [importId] = await db('health_imports').insert(importRow);
        } catch (e) {
          // Backward compatibility if file_hash is unavailable for any reason.
          if (Object.prototype.hasOwnProperty.call(importRow, 'file_hash')) {
            delete importRow.file_hash;
            [importId] = await db('health_imports').insert(importRow);
          } else {
            throw e;
          }
        }
        // Tag every record with this import's id
        const tagged = deduped.map(r => ({ ...r, import_id: importId }));
        await insertInChunks('health_data', tagged);
      }
      return res.json({
        imported: deduped.length,
        skipped_duplicates: records.length - deduped.length,
        duplicateFile,
        source: isAutoSleep ? 'autosleep_csv' : 'health_csv',
      });
    } catch (err) {
      console.error('CSV import parse error:', err);
      return res.status(500).json({ error: 'failed to parse csv', details: err.message });
    }
  }
  res.status(400).json({ error: 'no data provided' });
});

// upload macrofactor .xlsx or .csv
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');

const normalizeKey = k =>
  String(k).trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[\[\]\(\)\.\/%]/g, '')
    .replace(/[^a-z0-9_]/g, '_');

// Fix malformed quotes inside quoted CSV fields (e.g. 4 1/2"), which appear
// in some MacroFactor exports and can break strict CSV parsers.
const sanitizeBrokenCsvQuotes = (text) => {
  let out = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch !== '"') {
      out += ch;
      continue;
    }

    if (!inQuotes) {
      inQuotes = true;
      out += ch;
      continue;
    }

    // Escaped quote inside a quoted field ("")
    if (next === '"') {
      out += '""';
      i += 1;
      continue;
    }

    // Valid closing quote before delimiter/newline/end
    if (next === ',' || next === '\n' || next === '\r' || next === undefined) {
      inQuotes = false;
      out += ch;
      continue;
    }

    // Malformed interior quote: escape it instead of closing field.
    out += '""';
  }

  return out;
};

// Very tolerant CSV parsing for MacroFactor files that contain malformed
// embedded quotes (for example inch marks in serving sizes).
const parseCsvLineLenient = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === ',') {
      if (!inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (!inQuotes) {
        inQuotes = true;
        continue;
      }
      if (next === '"') {
        // When "" appears immediately before a field delimiter (or end of line),
        // the first " is a literal inch mark and the second " is the real
        // field-closing quote.  This is exactly the MacroFactor pattern:
        //   "large slice - 4 1/2" x 3 1/4" x 3/4""
        const next2 = line[i + 2];
        if (next2 === ',' || next2 === undefined) {
          cur += '"';       // keep inch mark as literal
          inQuotes = false; // the following " closes the field
          i += 1;           // skip the closing "
          continue;
        }
        // Otherwise it's a standard escaped-quote pair ""
        cur += '"';
        i += 1;
        continue;
      }
      if (next === ',' || next === undefined) {
        inQuotes = false;
        continue;
      }
      // malformed interior quote: keep it as literal inch mark, etc.
      cur += '"';
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
};

const parseCsvTextLenient = (text) => {
  // Strip UTF-8 BOM if present
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLineLenient(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLineLenient(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = vals[c] ?? '';
    }
    rows.push(row);
  }

  return rows;
};

const isHealthAutoExportHeaders = (headers = []) => {
  const normHeaders = headers
    .map(h => String(h || '').trim().toLowerCase())
    .filter(Boolean);
  const hasSourceName = normHeaders.some(h => /^source\s*name$/.test(h));
  const hasStartDate = normHeaders.some(h => /^start\s*date$/.test(h));
  return hasSourceName || hasStartDate;
};

const toRecord = (userId, typeKey, val, ts, meta = {}) => {
  // Skip sleep data from macro imports — only AutoSleep CSV should provide sleep
  if (/^sleep_analysis_/i.test(typeKey)) return null;

  const sleepTypeMatch = /sleep_analysis_/.test(typeKey);
  const parsedSleepHours = sleepTypeMatch ? parseDurationHours(val) : null;
  const num = parseFloat(String(val).replace(/[^0-9eE+\-.]/g, ''));
  let normalizedValue = Number.isFinite(num) ? num : String(val);

  if (sleepTypeMatch && parsedSleepHours != null) {
    normalizedValue = parsedSleepHours;
  }

  return {
    user_id: userId,
    type: 'macrofactor_' + typeKey,
    value: normalizedValue,
    timestamp: ts,
    raw: JSON.stringify({ column: typeKey, value: val, ...meta }),
  };
};

router.post('/macro/import', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const ext = path.extname(req.file.originalname || req.file.filename || '').toLowerCase();
  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
  const uploadFilename = resolveImportFilename(
    'ArfidWatch Import',
    req.file.originalname,
    req.body && req.body.filename,
    req.file.filename,
  );
  const records = [];
  const tsCandidates = /date|time|day/i;
  let skippedRows = 0;
  let duplicateFile = false;
  let sameHashImportIds = [];
  let parsedRowsForFoodLog = [];
  let isFoodLogFile = false;
  let foodLogInserted = 0;

  try {
    // Find all previous imports of this exact file (both stats and food-log records)
    const sameHashImports = await db('health_imports')
      .where({ user_id: req.user.id, file_hash: fileHash })
      .whereIn('source', ['macro', 'foodlog'])
      .select('id');
    sameHashImportIds = sameHashImports.map(r => r.id);
    duplicateFile = sameHashImportIds.length > 0;

    if (ext === '.xlsx' || ext === '.xls') {
      // Parse Excel with ExcelJS
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const sheet = workbook.worksheets[0];
      if (!sheet) return res.status(400).json({ error: 'no sheet found in xlsx' });

      // First row = headers
      const headers = [];
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col] = String(cell.value || '').trim();
      });
      if (isHealthAutoExportHeaders(headers)) {
        return res.status(400).json({
          error: 'health auto export file detected; use /api/health/import for this file type'
        });
      }
      if (isAutoSleepCsvHeaders(headers)) {
        return res.status(400).json({
          error: 'AutoSleep file detected; use /api/health/import for this file type'
        });
      }

      const toCellValue = (v) => {
        if (v == null) return '';
        if (typeof v === 'object') {
          if (v.text != null) return String(v.text);
          if (v.result != null) return String(v.result);
          if (v.richText && Array.isArray(v.richText)) {
            return v.richText.map(rt => rt.text || '').join('');
          }
        }
        return v;
      };

      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const rowUid = `xlsx-${rowNum}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const rowObj = {};
        headers.forEach((h, col) => {
          if (!h) return;
          rowObj[h] = toCellValue(row.getCell(col).value);
        });
        parsedRowsForFoodLog.push(rowObj);

        // find timestamp
        let ts = null;
        headers.forEach((h, col) => {
          if (!ts && tsCandidates.test(h)) {
            const v = toCellValue(row.getCell(col).value);
            if (v) {
              const d = v instanceof Date ? v : new Date(v);
              if (!isNaN(d.getTime())) ts = d.toISOString();
            }
          }
        });
        if (!ts) ts = new Date().toISOString();

        headers.forEach((h, col) => {
          if (!h || tsCandidates.test(h)) return;
          const cellVal = toCellValue(row.getCell(col).value);
          if (cellVal === null || cellVal === undefined || cellVal === '') return;
          const rec = toRecord(req.user.id, normalizeKey(h), cellVal, ts, {
            rowUid,
            rowNum,
            source: 'macro_xlsx',
          });
          if (rec) records.push(rec);
        });
      });
    } else {
      // Parse CSV using the lenient parser which correctly handles MacroFactor's
      // malformed embedded quotes (inch marks in serving-size fields).
      const csvText = fs.readFileSync(req.file.path, 'utf8');
      const csvLines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
      const csvHeaders = csvLines.length ? parseCsvLineLenient(csvLines[0]) : [];
      if (isHealthAutoExportHeaders(csvHeaders)) {
        return res.status(400).json({
          error: 'health auto export file detected; use /api/health/import for this file type'
        });
      }
      if (isAutoSleepCsvHeaders(csvHeaders)) {
        return res.status(400).json({
          error: 'AutoSleep file detected; use /api/health/import for this file type'
        });
      }
      const parsedRows = parseCsvTextLenient(csvText);
      parsedRowsForFoodLog = parsedRows;

      let csvRowNum = 1;
      for (const row of parsedRows) {
        csvRowNum += 1;
        const rowUid = `csv-${csvRowNum}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let ts = null;

        // MacroFactor food-log exports typically provide separate Date + Time columns.
        const datePart = row.Date || row.date;
        const timePart = row.Time || row.time;
        if (datePart && timePart) {
          const d = new Date(`${datePart} ${timePart}`);
          if (!isNaN(d.getTime())) ts = d.toISOString();
        }

        for (const [k, v] of Object.entries(row)) {
          if (!ts && tsCandidates.test(k) && v) {
            const d = new Date(v);
            if (!isNaN(d.getTime())) { ts = d.toISOString(); break; }
          }
        }
        if (!ts) ts = new Date().toISOString();
        for (const [k, v] of Object.entries(row)) {
          if (tsCandidates.test(k) || !v || String(v).trim() === '') continue;
          const rec = toRecord(req.user.id, normalizeKey(k), v, ts, {
            rowUid,
            rowNum: csvRowNum,
            source: 'macro_csv',
          });
          if (rec) records.push(rec);
        }
      }

    }

    // ── Food log extraction (CSV and XLSX) ─────────────────────────────────
    // If the file has MacroFactor food-log style columns, also populate
    // food_log_entries so share profile can show meal-by-meal entries.
    if (parsedRowsForFoodLog.length > 0) {
      const headers = Object.keys(parsedRowsForFoodLog[0]);
      const findH = (...tests) => headers.find(h => tests.some(t => t.test(String(h).trim())));
      const numOrNullFL = v => {
        if (v == null || String(v).trim() === '') return null;
        const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(n) ? n : null;
      };
      const normalizeDateOnly = (v) => {
        if (v == null || String(v).trim() === '') return null;
        if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        const s = String(v).trim();
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
      };

      const foodCol    = findH(/^food name$/i, /^food$/i);
      const mealCol    = findH(/^meal$/i);
      const calCol     = findH(/calorie|kcal|energy/i);
      const proteinCol = findH(/^protein/i);
      const carbsCol   = findH(/carb/i);
      const fatCol     = findH(/^fat\b/i);
      const amtCol     = findH(/^amount$|^serving$|^quantity$/i);
      const dateCol    = findH(/^date$/i, /date/i, /day/i);

      if (foodCol) {
        isFoodLogFile = true;
        // Purge previous same-file food-log entries before re-inserting
        if (sameHashImportIds.length > 0) {
          await db('food_log_entries').where({ user_id: req.user.id }).whereIn('import_id', sameHashImportIds).delete();
          await db('health_data').where({ user_id: req.user.id }).whereIn('import_id', sameHashImportIds).delete();
          await db('health_imports').where({ user_id: req.user.id }).whereIn('id', sameHashImportIds).delete();
          sameHashImportIds = []; // already cleaned up
        }
        await db('food_log_entries').where({ user_id: req.user.id }).whereNull('import_id').delete();

        const foodEntries = parsedRowsForFoodLog.map(row => {
          const datePart = dateCol ? row[dateCol] : (row.Date || row.date);
          const dateStr = normalizeDateOnly(datePart);
          const foodName = String(row[foodCol] || '').trim();
          if (!foodName || !dateStr) return null;
          return {
            user_id: req.user.id,
            import_id: null, // will be filled below
            date: dateStr,
            meal: mealCol ? String(row[mealCol] || '').trim() : '',
            food_name: foodName,
            quantity: amtCol ? String(row[amtCol] || '').trim() : '',
            calories: calCol ? numOrNullFL(row[calCol]) : null,
            protein_g: proteinCol ? numOrNullFL(row[proteinCol]) : null,
            carbs_g: carbsCol ? numOrNullFL(row[carbsCol]) : null,
            fat_g: fatCol ? numOrNullFL(row[fatCol]) : null,
          };
        }).filter(Boolean);

        const foodEntryKey = (e) => {
          const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
          const num = (v) => (v == null || v === '') ? '' : Number(v).toString();
          return [
            norm(e.date),
            norm(e.meal),
            norm(e.food_name),
            norm(e.quantity),
            num(e.calories),
            num(e.protein_g),
            num(e.carbs_g),
            num(e.fat_g),
          ].join('|');
        };

        // Deduplicate by normalized full food-log row fingerprint across uploads.
        const existingItems = await db('food_log_entries')
          .where({ user_id: req.user.id })
          .select('date', 'meal', 'food_name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g');
        const existingKeys = new Set(existingItems.map(foodEntryKey));
        const newFoodEntries = foodEntries.filter(e => !existingKeys.has(foodEntryKey(e)));

        if (newFoodEntries.length > 0) {
          // Create a dedicated 'foodlog' import record — separate from the stats import
          const [foodlogImportId] = await db('health_imports').insert({
            user_id: req.user.id,
            filename: uploadFilename,
            source: 'foodlog',
            file_hash: fileHash,
            imported_at: new Date().toISOString(),
            record_count: newFoodEntries.length,
          });
          const taggedFood = newFoodEntries.map(e => ({ ...e, import_id: foodlogImportId }));
          await insertInChunks('food_log_entries', taggedFood);
          foodLogInserted = newFoodEntries.length;
        }
      }
    }

    const deduped = isFoodLogFile ? [] : await filterDuplicateStats(req.user.id, records);

    if (deduped.length > 0) {
      // Stats always get their own dedicated 'macro' import record
      if (sameHashImportIds.length > 0) {
        await db('health_data').where({ user_id: req.user.id }).whereIn('import_id', sameHashImportIds).delete();
        await db('health_imports').where({ user_id: req.user.id }).whereIn('id', sameHashImportIds).delete();
      }
      const [importId] = await db('health_imports').insert({
        user_id: req.user.id,
        filename: uploadFilename,
        source: 'macro',
        file_hash: fileHash,
        imported_at: new Date().toISOString(),
        record_count: deduped.length,
      });
      const tagged = deduped.map(r => ({ ...r, import_id: importId }));
      await insertInChunks('health_data', tagged);
    }
    res.json({ imported: isFoodLogFile ? foodLogInserted : deduped.length, isFoodLogFile, skipped: skippedRows, skipped_duplicates: records.length - deduped.length, duplicateFile });
  } catch (err) {
    console.error('Macro import error:', err);
    res.status(500).json({ error: 'failed to import', details: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
});

// List all imports for the current user
router.get('/imports', authenticate, async (req, res) => {
  const imports = await db('health_imports')
    .where('user_id', req.user.id)
    .orderBy('imported_at', 'desc');
  res.json({ imports });
});

// Delete an import and all its associated health data
router.delete('/imports/:id', authenticate, async (req, res) => {
  const importId = parseInt(req.params.id, 10);
  const row = await db('health_imports').where({ id: importId, user_id: req.user.id }).first();
  if (!row) return res.status(404).json({ error: 'not found' });
  await db('health_data').where({ user_id: req.user.id, import_id: importId }).delete();
  await db('food_log_entries').where({ user_id: req.user.id, import_id: importId }).delete();
  await db('health_imports').where({ id: importId }).delete();
  res.json({ deleted: importId });
});

// Delete ALL imports and all associated health data + food log entries for the user
router.delete('/imports', authenticate, async (req, res) => {
  const uid = req.user.id;
  await db('health_data').where({ user_id: uid }).delete();
  await db('food_log_entries').where({ user_id: uid }).delete();
  await db('health_imports').where({ user_id: uid }).delete();
  res.json({ ok: true });
});

// get health data entries for user
router.get('/', authenticate, async (req, res) => {
  const { start, end } = req.query;
  let query = db('health_data').where('user_id', req.user.id);
  if (start) query = query.where('timestamp', '>=', start);
  if (end) query = query.where('timestamp', '<=', end);
  const rows = await query.orderBy('timestamp', 'asc');
  res.json({ data: rows });
});

// Sleep-specific daily aggregation (small payload, robust unit normalization).
router.get('/sleep/daily', authenticate, async (req, res) => {
  const daysRaw = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(daysRaw) ? Math.max(7, Math.min(730, daysRaw)) : 180;
  const tzOffsetRaw = Number.parseInt(req.query.tzOffsetMinutes, 10);
  const tzOffsetMinutes = Number.isFinite(tzOffsetRaw) ? tzOffsetRaw : 0;

  const endIso = new Date().toISOString();
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - days);
  const startIso = startDate.toISOString();

  const AUTOSLEEP_EXTRA_TYPES = [
    'sleep_efficiency_percent', 'sleep_sessions_count',
    'sleep_heart_rate_bpm', 'waking_heart_rate_bpm', 'day_heart_rate_bpm',
    'sleep_hrv_ms', 'heart_rate_variability_ms',
    'blood_oxygen_saturation__', 'blood_oxygen_min__', 'blood_oxygen_max__',
    'respiratory_rate_countmin', 'resp_rate_min_countmin', 'resp_rate_max_countmin',
    'breathing_disturbances_count', 'sleeping_wrist_temperature_degf',
    'fell_asleep_in_hr',
  ];

  const rows = await db('health_data')
    .select('type', 'value', 'timestamp')
    .where({ user_id: req.user.id })
    .andWhere('timestamp', '>=', startIso)
    .andWhere('timestamp', '<=', endIso)
    .andWhere(function andSleep() {
      this.where('type', 'like', 'sleep_analysis_%')
        .orWhere('type', 'like', 'macrofactor_sleep_analysis_%')
        .orWhereIn('type', AUTOSLEEP_EXTRA_TYPES);
    })
    .orderBy('timestamp', 'asc');

  const byDay = new Map();
  const byDayExtra = new Map();

  for (const row of rows) {
    const day = dayKeyWithOffset(row.timestamp, tzOffsetMinutes);
    if (!day) continue;

    const type = canonicalSleepType(row.type);
    if (type) {
      const value = sleepHours(type, row.value);
      if (value == null) continue;
      let bucket = byDay.get(day);
      if (!bucket) { bucket = { day, _raw: Object.create(null) }; byDay.set(day, bucket); }
      const prev = bucket._raw[type];
      if (!prev || String(row.timestamp) > String(prev.timestamp)) {
        bucket._raw[type] = { timestamp: row.timestamp, value };
      }
    } else if (AUTOSLEEP_EXTRA_TYPES.includes(row.type)) {
      const value = Number(row.value);
      if (!Number.isFinite(value)) continue;
      if (!byDayExtra.has(day)) byDayExtra.set(day, {});
      const extra = byDayExtra.get(day);
      const prevTs = extra[`${row.type}__ts`];
      if (!prevTs || String(row.timestamp) > prevTs) {
        extra[row.type] = value;
        extra[`${row.type}__ts`] = String(row.timestamp);
      }
    }
  }

  const allSleepDays = new Set([...byDay.keys(), ...byDayExtra.keys()]);
  const daily = [...allSleepDays]
    .map((day) => {
      const d = byDay.get(day) || { day, _raw: Object.create(null) };
      const extra = byDayExtra.get(day) || {};
      const total = d._raw.sleep_analysis_total_sleep_hr?.value;
      const asleep = d._raw.sleep_analysis_asleep_hr?.value;
      const inBed = d._raw.sleep_analysis_in_bed_hr?.value;
      const core = d._raw.sleep_analysis_core_hr?.value || 0;
      const rem = d._raw.sleep_analysis_rem_hr?.value || 0;
      const deep = d._raw.sleep_analysis_deep_hr?.value || 0;
      const awake = d._raw.sleep_analysis_awake_hr?.value;
      const quality = d._raw.sleep_analysis_quality_hr?.value;

      let interpretedTotal = total;
      if (!Number.isFinite(interpretedTotal)) {
        const staged = core + rem + deep;
        interpretedTotal = staged > 0 ? staged : asleep;
      }

      return {
        day,
        total_sleep_hr: Number.isFinite(interpretedTotal) ? interpretedTotal : null,
        asleep_hr: Number.isFinite(asleep) ? asleep : null,
        in_bed_hr: Number.isFinite(inBed) ? inBed : null,
        core_hr: core || null,
        rem_hr: rem || null,
        deep_hr: deep || null,
        awake_hr: Number.isFinite(awake) ? awake : null,
        quality_hr: Number.isFinite(quality) ? quality : null,
        efficiency: extra.sleep_efficiency_percent ?? null,
        sessions: extra.sleep_sessions_count ?? null,
        sleep_bpm: extra.sleep_heart_rate_bpm ?? null,
        waking_bpm: extra.waking_heart_rate_bpm ?? null,
        hrv: extra.heart_rate_variability_ms ?? null,
        sleep_hrv: extra.sleep_hrv_ms ?? null,
        spo2: extra.blood_oxygen_saturation__ ?? null,
        resp_rate: extra.respiratory_rate_countmin ?? null,
        breath_dist: extra.breathing_disturbances_count ?? null,
        wrist_temp: extra.sleeping_wrist_temperature_degf ?? null,
        fell_asleep_in: extra.fell_asleep_in_hr ?? null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const totals = daily.map((d) => d.total_sleep_hr).filter((v) => Number.isFinite(v));
  const avgTotal = totals.length
    ? totals.reduce((sum, n) => sum + n, 0) / totals.length
    : null;

  res.json({
    range: { start: startIso, end: endIso, days },
    nights: daily.length,
    average_total_sleep_hr: avgTotal,
    data: daily,
  });
});

// Lightweight all-time summary for the 4 hero metrics (used as preview fallback)
const HERO_TYPES = [
  'dietary_energy_kcal', 'macrofactor_energy', 'macrofactor_calories',
  'step_count_count', 'macrofactor_steps',
  'weight_lb', 'macrofactor_weight', 'macrofactor_weight_lb',
  'sleep_analysis_total_sleep_hr',
];
router.get('/hero', authenticate, async (req, res) => {
  const rows = await db('health_data')
    .where('user_id', req.user.id)
    .whereIn('type', HERO_TYPES)
    .orderBy('timestamp', 'asc');
  res.json({ data: rows });
});

// Auto-pull status (server worker)
router.get('/auto-pull/status', authenticate, async (_req, res) => {
  res.json(getAutoHealthPullStatus());
});

// Manual trigger for auto-pull worker
router.post('/auto-pull/pull', authenticate, async (_req, res) => {
  const status = getAutoHealthPullStatus();
  if (!status.configured) {
    return res.status(400).json({
      error: 'auto pull is not configured on server',
      hint: 'Set AUTO_PULL_SOURCE_URL (or HEALTH_AUTO_EXPORT_API_URL) and AUTO_PULL_INGEST_KEY on the backend.',
    });
  }
  const result = await triggerAutoHealthPullNow();
  if (!result.ok) {
    return res.status(400).json(result);
  }
  const refreshed = getAutoHealthPullStatus();
  res.json({ ...result, status: refreshed });
});

module.exports = router;