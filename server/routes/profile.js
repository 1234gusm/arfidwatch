const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { isIP } = require('net');
const dns = require('dns');
const { promisify } = require('util');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const dnsLookup = promisify(dns.lookup);

/* ── V-3: SSRF — reject private / reserved IP addresses ── */
function isPrivateIP(ip) {
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract the IPv4 part
  const v4match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = v4match ? v4match[1] : ip;

  if (isIP(addr) === 4) {
    const parts = addr.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local + cloud metadata)
    if (a === 0) return true;                         // 0.0.0.0/8
    return false;
  }

  // IPv6: block loopback and link-local
  const lower = addr.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;  // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  return false;
}

const router = express.Router();
const SALT_ROUNDS = 12;
const hashIngestKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\//i;

const VALID_PERIODS = ['today', 'week', 'month', 'custom'];

function parseJsonText(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function sanitizeStringArray(value, fieldName, maxItems = 200, maxLen = 120) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return value
    .map(v => String(v || '').trim())
    .filter(v => v.length > 0 && v.length <= maxLen)
    .slice(0, maxItems);
}

function sanitizeColorMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('med_entry_colors must be an object');
  }
  const out = {};
  const entries = Object.entries(value).slice(0, 2000);
  for (const [k, v] of entries) {
    const key = String(k || '').trim();
    const color = String(v || '').trim();
    if (!key) continue;
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      out[key] = color;
    }
  }
  return out;
}

// GET /api/profile
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db('users').where({ id: userId }).select('username', 'email').first();
    let profile = await db('user_profiles').where({ user_id: userId }).first();
    if (!profile) {
      await db('user_profiles').insert({ user_id: userId, export_period: 'week' });
      profile = { export_period: 'week', share_token: null, share_passcode_hash: null };
    }
    res.json({
      username: user.username,
      email: user.email || null,
      export_period: profile.export_period,
      share_token: profile.share_token || null,
      has_passcode: !!profile.share_passcode_hash,
      share_food_log: !!profile.share_food_log,
      share_medications: !!profile.share_medications,
      share_journal: !!profile.share_journal,
      share_period: profile.share_period || null,
      has_ingest_key: !!profile.ingest_key_hash,
      ingest_key_last_used_at: profile.ingest_key_last_used_at || null,
      health_auto_export_url: profile.health_auto_export_url || null,
      nav_tab_order: parseJsonText(profile.nav_tab_order, null),
      nav_hidden_tabs: parseJsonText(profile.nav_hidden_tabs, null),
      hidden_health_types: parseJsonText(profile.hidden_health_types, null),
      health_stat_order: parseJsonText(profile.health_stat_order, null),
      med_entry_colors: parseJsonText(profile.med_entry_colors, null),
    });
  } catch (err) {
    console.error('profile GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/profile
router.put('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      export_period,
      username,
      username_password,
      email,
      passcode,
      clear_passcode,
      regenerate_share,
      clear_share,
      share_food_log,
      share_medications,
      share_journal,
      share_period,
      regenerate_ingest_key,
      clear_ingest_key,
      health_auto_export_url,
      nav_tab_order,
      nav_hidden_tabs,
      hidden_health_types,
      health_stat_order,
      med_entry_colors,
    } = req.body;
    const updates = {};
    const userUpdates = {};
    let plainIngestKey = null;

    if (username !== undefined) {
      const normalizedUsername = String(username).trim();
      if (!normalizedUsername) {
        return res.status(400).json({ error: 'username cannot be empty' });
      }
      if (!username_password || !String(username_password).trim()) {
        return res.status(400).json({ error: 'account password is required to change username' });
      }

      const userForPassword = await db('users').where({ id: userId }).select('password').first();
      if (!userForPassword?.password) {
        return res.status(400).json({ error: 'user not found' });
      }

      const passwordMatch = await bcrypt.compare(
        String(username_password),
        userForPassword.password,
      );
      if (!passwordMatch) {
        return res.status(403).json({ error: 'invalid account password' });
      }

      const usernameUser = await db('users').where({ username: normalizedUsername }).whereNot({ id: userId }).first();
      if (usernameUser) {
        return res.status(400).json({ error: 'username taken' });
      }

      userUpdates.username = normalizedUsername;
    }

    if (email !== undefined) {
      const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
      if (normalizedEmail) {
        if (!EMAIL_RE.test(normalizedEmail)) {
          return res.status(400).json({ error: 'invalid email address' });
        }
        const emailUser = await db('users').where({ email: normalizedEmail }).whereNot({ id: userId }).first();
        if (emailUser) {
          return res.status(400).json({ error: 'email already in use' });
        }
      }
      userUpdates.email = normalizedEmail;
    }

    if (export_period !== undefined) {
      if (!VALID_PERIODS.includes(export_period)) {
        return res.status(400).json({ error: 'invalid export_period' });
      }
      updates.export_period = export_period;
    }

    if (regenerate_share) {
      updates.share_token = crypto.randomBytes(24).toString('hex');
    }

    if (clear_share) {
      updates.share_token = null;
      updates.share_passcode_hash = null;
    }

    if (passcode !== undefined && String(passcode).trim() !== '') {
      updates.share_passcode_hash = await bcrypt.hash(String(passcode), SALT_ROUNDS);
    }

    if (clear_passcode) {
      updates.share_passcode_hash = null;
    }

    if (share_food_log !== undefined) {
      updates.share_food_log = !!share_food_log;
    }

    if (share_medications !== undefined) {
      updates.share_medications = !!share_medications;
    }

    if (share_journal !== undefined) {
      updates.share_journal = !!share_journal;
    }

    if (share_period !== undefined) {
      const VALID_SHARE_PERIODS = ['week', 'two_weeks', 'month', null];
      if (!VALID_SHARE_PERIODS.includes(share_period)) {
        return res.status(400).json({ error: 'invalid share_period' });
      }
      updates.share_period = share_period; // null = let doctor choose
    }

    if (regenerate_ingest_key) {
      plainIngestKey = `awk_${crypto.randomBytes(24).toString('hex')}`;
      updates.ingest_key_hash = hashIngestKey(plainIngestKey);
      updates.ingest_key_last_used_at = null;
    }

    if (clear_ingest_key) {
      updates.ingest_key_hash = null;
      updates.ingest_key_last_used_at = null;
    }

    if (health_auto_export_url !== undefined) {
      const normalizedUrl = health_auto_export_url ? String(health_auto_export_url).trim() : null;
      if (normalizedUrl) {
        try {
          const u = new URL(normalizedUrl);
          if (!['http:', 'https:'].includes(u.protocol)) {
            return res.status(400).json({ error: 'health_auto_export_url must use http or https' });
          }
          /* V-3: Resolve hostname and block private/reserved IPs */
          const hostname = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
          if (isIP(hostname)) {
            if (isPrivateIP(hostname)) {
              return res.status(400).json({ error: 'Private/reserved IP addresses are not allowed' });
            }
          } else {
            try {
              const { address } = await dnsLookup(hostname);
              if (isPrivateIP(address)) {
                return res.status(400).json({ error: 'URL resolves to a private/reserved IP address' });
              }
            } catch (_) {
              return res.status(400).json({ error: 'Could not resolve hostname' });
            }
          }
        } catch (_) {
          return res.status(400).json({ error: 'invalid health_auto_export_url' });
        }
      }
      updates.health_auto_export_url = normalizedUrl;
    }

    try {
      if (nav_tab_order !== undefined) {
        updates.nav_tab_order = nav_tab_order === null
          ? null
          : JSON.stringify(sanitizeStringArray(nav_tab_order, 'nav_tab_order'));
      }
      if (nav_hidden_tabs !== undefined) {
        updates.nav_hidden_tabs = nav_hidden_tabs === null
          ? null
          : JSON.stringify(sanitizeStringArray(nav_hidden_tabs, 'nav_hidden_tabs'));
      }
      if (hidden_health_types !== undefined) {
        updates.hidden_health_types = hidden_health_types === null
          ? null
          : JSON.stringify(sanitizeStringArray(hidden_health_types, 'hidden_health_types'));
      }
      if (health_stat_order !== undefined) {
        updates.health_stat_order = health_stat_order === null
          ? null
          : JSON.stringify(sanitizeStringArray(health_stat_order, 'health_stat_order'));
      }
      if (med_entry_colors !== undefined) {
        updates.med_entry_colors = med_entry_colors === null
          ? null
          : JSON.stringify(sanitizeColorMap(med_entry_colors));
      }
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    if (Object.keys(userUpdates).length > 0) {
      await db('users').where({ id: userId }).update(userUpdates);
    }

    if (Object.keys(updates).length > 0) {
      const exists = await db('user_profiles').where({ user_id: userId }).first();
      if (exists) {
        await db('user_profiles').where({ user_id: userId }).update(updates);
      } else {
        await db('user_profiles').insert({ user_id: userId, export_period: 'week', ...updates });
      }
    }

    // Clear passcode via raw query to guarantee SQLite stores NULL (not skipped)
    if (clear_passcode) {
      await db.raw('UPDATE user_profiles SET share_passcode_hash = NULL WHERE user_id = ?', [userId]);
    }

    const profile = await db('user_profiles').where({ user_id: userId }).first();
    const user = await db('users').where({ id: userId }).select('username', 'email').first();
    res.json({
      ok: true,
      username: user?.username || null,
      email: user?.email || null,
      export_period: profile?.export_period || 'week',
      share_token: profile?.share_token || null,
      has_passcode: !!(profile?.share_passcode_hash),
      share_food_log: !!(profile?.share_food_log),
      share_medications: !!(profile?.share_medications),
      share_journal: !!(profile?.share_journal),
      has_ingest_key: !!(profile?.ingest_key_hash),
      ingest_key_last_used_at: profile?.ingest_key_last_used_at || null,
      health_auto_export_url: profile?.health_auto_export_url || null,
      nav_tab_order: parseJsonText(profile?.nav_tab_order, null),
      nav_hidden_tabs: parseJsonText(profile?.nav_hidden_tabs, null),
      hidden_health_types: parseJsonText(profile?.hidden_health_types, null),
      health_stat_order: parseJsonText(profile?.health_stat_order, null),
      med_entry_colors: parseJsonText(profile?.med_entry_colors, null),
      ingest_key: plainIngestKey,
    });
  } catch (err) {
    console.error('profile PUT error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
