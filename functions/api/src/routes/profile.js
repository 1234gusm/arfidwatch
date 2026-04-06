import { Query } from 'node-appwrite';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PERIODS = ['today', 'week', 'month', 'custom'];
const VALID_SHARE_PERIODS = ['week', 'two_weeks', 'month', null];
const hashIngestKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function sanitizeStringArray(value, fieldName, maxItems = 200, maxLen = 120) {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
  return value.map(v => String(v || '').trim()).filter(v => v.length > 0 && v.length <= maxLen).slice(0, maxItems);
}

function sanitizeColorMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('med_entry_colors must be an object');
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 2000)) {
    const key = String(k || '').trim();
    const color = String(v || '').trim();
    if (key && /^#[0-9a-fA-F]{6}$/.test(color)) out[key] = color;
  }
  return out;
}

function strip$(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, user_id, ...rest } = doc;
  return rest;
}

export async function handleProfile({ req, res, db, users, userId, body, method, path }) {

  // GET /api/profile
  if (method === 'GET' && path === '/api/profile') {
    try {
      const user = await users.get(userId);
      let profile = await db.findOne('user_profiles', [Query.equal('user_id', userId)]);
      if (!profile) {
        profile = await db.create('user_profiles', { user_id: userId, export_period: 'week' }, userId);
      }

      // Latest height from health_data
      const heightRow = await db.findOne('health_data', [
        Query.equal('user_id', userId),
        Query.contains('type', ['height_cm', 'height_in']),
        Query.orderDesc('timestamp'),
      ]);

      return res.json({
        username: user.name || user.email || userId,
        email: user.email || null,
        export_period: profile.export_period || 'week',
        share_token: profile.share_token || null,
        has_passcode: !!profile.share_passcode_hash,
        share_food_log: !!profile.share_food_log,
        share_food_notes: !!profile.share_food_notes,
        share_medications: !!profile.share_medications,
        share_journal: !!profile.share_journal,
        share_period: profile.share_period || null,
        has_ingest_key: !!profile.ingest_key_hash,
        ingest_key_last_used_at: profile.ingest_key_last_used_at || null,
        health_auto_export_url: profile.health_auto_export_url || null,
        nav_tab_order: parseJsonField(profile.nav_tab_order, null),
        nav_hidden_tabs: parseJsonField(profile.nav_hidden_tabs, null),
        hidden_health_types: parseJsonField(profile.hidden_health_types, null),
        health_stat_order: parseJsonField(profile.health_stat_order, null),
        med_entry_colors: parseJsonField(profile.med_entry_colors, null),
        height_cm: heightRow ? { value: heightRow.value, unit: heightRow.type === 'height_in' ? 'in' : 'cm' } : null,
      });
    } catch (err) {
      return res.json({ error: 'server error' }, 500);
    }
  }

  // PUT /api/profile
  if (method === 'PUT' && path === '/api/profile') {
    try {
      const {
        export_period, username, email,
        passcode, clear_passcode, regenerate_share, clear_share,
        share_food_log, share_food_notes, share_medications, share_journal, share_period,
        regenerate_ingest_key, clear_ingest_key,
        height_cm, height_unit, health_auto_export_url,
        nav_tab_order, nav_hidden_tabs, hidden_health_types, health_stat_order, med_entry_colors,
      } = body;

      let profile = await db.findOne('user_profiles', [Query.equal('user_id', userId)]);
      const isNew = !profile;
      if (isNew) {
        profile = await db.create('user_profiles', { user_id: userId, export_period: 'week' }, userId);
      }
      const profileId = profile.$id;

      const updates = {};
      let plainIngestKey = null;

      // Username change (stored in Appwrite Auth)
      if (username !== undefined) {
        const normalizedUsername = String(username).trim();
        if (!normalizedUsername) return res.json({ error: 'username cannot be empty' }, 400);
        try { await users.updateName(userId, normalizedUsername); }
        catch (e) { return res.json({ error: 'failed to update username' }, 500); }
      }

      // Email change
      if (email !== undefined) {
        const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
        if (normalizedEmail && !EMAIL_RE.test(normalizedEmail)) {
          return res.json({ error: 'invalid email address' }, 400);
        }
        if (normalizedEmail) {
          try { await users.updateEmail(userId, normalizedEmail); }
          catch (e) { return res.json({ error: 'email already in use or invalid' }, 400); }
        }
      }

      if (export_period !== undefined) {
        if (!VALID_PERIODS.includes(export_period)) return res.json({ error: 'invalid export_period' }, 400);
        updates.export_period = export_period;
      }

      if (regenerate_share) updates.share_token = crypto.randomBytes(24).toString('hex');
      if (clear_share) { updates.share_token = null; updates.share_passcode_hash = null; }

      if (passcode !== undefined && String(passcode).trim() !== '') {
        updates.share_passcode_hash = await bcrypt.hash(String(passcode), SALT_ROUNDS);
      }
      if (clear_passcode) updates.share_passcode_hash = null;

      if (share_food_log !== undefined) updates.share_food_log = !!share_food_log;
      if (share_food_notes !== undefined) updates.share_food_notes = !!share_food_notes;
      if (share_medications !== undefined) updates.share_medications = !!share_medications;
      if (share_journal !== undefined) updates.share_journal = !!share_journal;

      if (share_period !== undefined) {
        if (!VALID_SHARE_PERIODS.includes(share_period)) return res.json({ error: 'invalid share_period' }, 400);
        updates.share_period = share_period;
      }

      if (regenerate_ingest_key) {
        plainIngestKey = `awk_${crypto.randomBytes(24).toString('hex')}`;
        updates.ingest_key_hash = hashIngestKey(plainIngestKey);
        updates.ingest_key_last_used_at = null;
      }
      if (clear_ingest_key) { updates.ingest_key_hash = null; updates.ingest_key_last_used_at = null; }

      if (height_cm !== undefined) {
        const hVal = parseFloat(height_cm);
        const hUnit = height_unit === 'in' ? 'height_in' : 'height_cm';
        if (!isNaN(hVal) && hVal > 0 && hVal < 300) {
          await db.create('health_data', {
            user_id: userId, type: hUnit, value: hVal,
            timestamp: new Date().toISOString(),
            raw: JSON.stringify({ source: 'profile' }),
          }, userId);
        }
      }

      if (health_auto_export_url !== undefined) {
        const normalizedUrl = health_auto_export_url ? String(health_auto_export_url).trim() : null;
        if (normalizedUrl) {
          try {
            const u = new URL(normalizedUrl);
            if (!['http:', 'https:'].includes(u.protocol)) {
              return res.json({ error: 'health_auto_export_url must use http or https' }, 400);
            }
          } catch (_) { return res.json({ error: 'invalid health_auto_export_url' }, 400); }
        }
        updates.health_auto_export_url = normalizedUrl;
      }

      try {
        if (nav_tab_order !== undefined) {
          updates.nav_tab_order = nav_tab_order === null ? null : JSON.stringify(sanitizeStringArray(nav_tab_order, 'nav_tab_order'));
        }
        if (nav_hidden_tabs !== undefined) {
          updates.nav_hidden_tabs = nav_hidden_tabs === null ? null : JSON.stringify(sanitizeStringArray(nav_hidden_tabs, 'nav_hidden_tabs'));
        }
        if (hidden_health_types !== undefined) {
          updates.hidden_health_types = hidden_health_types === null ? null : JSON.stringify(sanitizeStringArray(hidden_health_types, 'hidden_health_types'));
        }
        if (health_stat_order !== undefined) {
          updates.health_stat_order = health_stat_order === null ? null : JSON.stringify(sanitizeStringArray(health_stat_order, 'health_stat_order'));
        }
        if (med_entry_colors !== undefined) {
          updates.med_entry_colors = med_entry_colors === null ? null : JSON.stringify(sanitizeColorMap(med_entry_colors));
        }
      } catch (validationErr) {
        return res.json({ error: validationErr.message }, 400);
      }

      if (Object.keys(updates).length > 0) {
        await db.update('user_profiles', profileId, updates);
      }

      // Re-fetch for response
      const updatedProfile = await db.findOne('user_profiles', [Query.equal('user_id', userId)]);
      const user = await users.get(userId);

      const heightRow = await db.findOne('health_data', [
        Query.equal('user_id', userId),
        Query.contains('type', ['height_cm', 'height_in']),
        Query.orderDesc('timestamp'),
      ]);

      return res.json({
        ok: true,
        username: user.name || user.email || userId,
        email: user.email || null,
        export_period: updatedProfile?.export_period || 'week',
        share_token: updatedProfile?.share_token || null,
        has_passcode: !!(updatedProfile?.share_passcode_hash),
        share_food_log: !!(updatedProfile?.share_food_log),
        share_food_notes: !!(updatedProfile?.share_food_notes),
        share_medications: !!(updatedProfile?.share_medications),
        share_journal: !!(updatedProfile?.share_journal),
        has_ingest_key: !!(updatedProfile?.ingest_key_hash),
        ingest_key_last_used_at: updatedProfile?.ingest_key_last_used_at || null,
        health_auto_export_url: updatedProfile?.health_auto_export_url || null,
        nav_tab_order: parseJsonField(updatedProfile?.nav_tab_order, null),
        nav_hidden_tabs: parseJsonField(updatedProfile?.nav_hidden_tabs, null),
        hidden_health_types: parseJsonField(updatedProfile?.hidden_health_types, null),
        health_stat_order: parseJsonField(updatedProfile?.health_stat_order, null),
        med_entry_colors: parseJsonField(updatedProfile?.med_entry_colors, null),
        ingest_key: plainIngestKey,
        height_cm: heightRow ? { value: heightRow.value, unit: heightRow.type === 'height_in' ? 'in' : 'cm' } : null,
      });
    } catch (err) {
      return res.json({ error: 'server error' }, 500);
    }
  }

  return res.json({ error: 'Not found' }, 404);
}
