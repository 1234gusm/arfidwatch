#!/usr/bin/env node
/**
 * Setup Appwrite database, collections, attributes, and indexes for ArfidWatch.
 *
 * Usage:
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT=69d314770014fcf64eaf \
 *   APPWRITE_KEY=<your-api-key> \
 *   node scripts/setup-collections.mjs
 */
import { Client, Databases, ID } from 'node-appwrite';

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT, APPWRITE_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT || !APPWRITE_KEY) {
  console.error('Required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT, APPWRITE_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT).setKey(APPWRITE_KEY);
const db = new Databases(client);
const DB_ID = 'arfidwatch';

async function safe(fn) {
  try { return await fn(); } catch (e) {
    if (e.code === 409) return null; // already exists
    throw e;
  }
}

// ── Collections ────────────────────────────────────────────────────────────
const collections = [
  { id: 'journal_entries', name: 'Journal Entries' },
  { id: 'food_log_entries', name: 'Food Log Entries' },
  { id: 'medication_entries', name: 'Medication Entries' },
  { id: 'medication_quick_buttons', name: 'Medication Quick Buttons' },
  { id: 'user_profiles', name: 'User Profiles' },
  { id: 'health_data', name: 'Health Data' },
  { id: 'health_imports', name: 'Health Imports' },
  { id: 'push_subscriptions', name: 'Push Subscriptions' },
  { id: 'user_reminders', name: 'User Reminders' },
];

// ── Attributes ─────────────────────────────────────────────────────────────
// type: 'string' | 'float' | 'integer' | 'boolean'
// size: string max length (required for string attrs)
const attributes = {
  journal_entries: [
    { key: 'user_id',  type: 'string',  size: 64,    required: true  },
    { key: 'date',     type: 'string',  size: 10,    required: true  },
    { key: 'title',    type: 'string',  size: 500,   required: false },
    { key: 'text',     type: 'string',  size: 50000, required: false },
    { key: 'mood',     type: 'string',  size: 50,    required: false },
  ],
  food_log_entries: [
    { key: 'user_id',   type: 'string',  size: 64,    required: true  },
    { key: 'import_id', type: 'string',  size: 64,    required: false },
    { key: 'date',      type: 'string',  size: 10,    required: true  },
    { key: 'meal',      type: 'string',  size: 100,   required: false },
    { key: 'food_name', type: 'string',  size: 500,   required: false },
    { key: 'quantity',  type: 'string',  size: 200,   required: false },
    { key: 'calories',  type: 'float',              required: false },
    { key: 'protein_g', type: 'float',              required: false },
    { key: 'carbs_g',   type: 'float',              required: false },
    { key: 'fat_g',     type: 'float',              required: false },
    { key: 'note',      type: 'string',  size: 5000, required: false },
  ],
  medication_entries: [
    { key: 'user_id',         type: 'string',  size: 64,   required: true  },
    { key: 'date',            type: 'string',  size: 10,   required: true  },
    { key: 'time',            type: 'string',  size: 10,   required: false },
    { key: 'medication_name', type: 'string',  size: 300,  required: true  },
    { key: 'dosage',          type: 'string',  size: 200,  required: false },
    { key: 'notes',           type: 'string',  size: 5000, required: false },
    { key: 'taken_at',        type: 'string',  size: 30,   required: false },
    { key: 'created_at',      type: 'string',  size: 30,   required: false },
  ],
  medication_quick_buttons: [
    { key: 'user_id',         type: 'string',  size: 64,   required: true  },
    { key: 'medication_name', type: 'string',  size: 300,  required: true  },
    { key: 'dosage',          type: 'string',  size: 200,  required: false },
    { key: 'color',           type: 'string',  size: 30,   required: false },
    { key: 'sort_order',      type: 'integer',             required: false },
  ],
  user_profiles: [
    { key: 'user_id',                type: 'string',  size: 64,    required: true  },
    { key: 'username',               type: 'string',  size: 200,   required: false },
    { key: 'export_period',          type: 'string',  size: 20,    required: false },
    { key: 'share_token',            type: 'string',  size: 128,   required: false },
    { key: 'share_passcode_hash',    type: 'string',  size: 256,   required: false },
    { key: 'share_food_log',         type: 'boolean',              required: false },
    { key: 'share_food_notes',       type: 'boolean',              required: false },
    { key: 'share_medications',      type: 'boolean',              required: false },
    { key: 'share_journal',          type: 'boolean',              required: false },
    { key: 'share_period',           type: 'string',  size: 20,    required: false },
    { key: 'ingest_key_hash',        type: 'string',  size: 256,   required: false },
    { key: 'ingest_key_last_used_at',type: 'string',  size: 30,    required: false },
    { key: 'health_auto_export_url', type: 'string',  size: 2000,  required: false },
    { key: 'nav_tab_order',          type: 'string',  size: 2000,  required: false },
    { key: 'nav_hidden_tabs',        type: 'string',  size: 2000,  required: false },
    { key: 'hidden_health_types',    type: 'string',  size: 10000, required: false },
    { key: 'health_stat_order',      type: 'string',  size: 10000, required: false },
    { key: 'med_entry_colors',       type: 'string',  size: 5000,  required: false },
  ],
  health_data: [
    { key: 'user_id',   type: 'string',  size: 64,    required: true  },
    { key: 'type',      type: 'string',  size: 200,   required: true  },
    { key: 'value',     type: 'float',               required: false },
    { key: 'timestamp', type: 'string',  size: 30,    required: true  },
    { key: 'raw',       type: 'string',  size: 50000, required: false },
    { key: 'import_id', type: 'string',  size: 64,    required: false },
  ],
  health_imports: [
    { key: 'user_id',      type: 'string',  size: 64,   required: true  },
    { key: 'filename',     type: 'string',  size: 500,  required: false },
    { key: 'source',       type: 'string',  size: 100,  required: false },
    { key: 'imported_at',  type: 'string',  size: 30,   required: false },
    { key: 'record_count', type: 'integer',             required: false },
    { key: 'file_hash',    type: 'string',  size: 128,  required: false },
  ],
  push_subscriptions: [
    { key: 'user_id',    type: 'string',  size: 64,   required: true  },
    { key: 'endpoint',   type: 'string',  size: 2000, required: true  },
    { key: 'p256dh',     type: 'string',  size: 500,  required: true  },
    { key: 'auth',       type: 'string',  size: 500,  required: true  },
    { key: 'created_at', type: 'string',  size: 30,   required: false },
  ],
  user_reminders: [
    { key: 'user_id',        type: 'string',  size: 64,    required: true  },
    { key: 'reminders_json', type: 'string',  size: 50000, required: false },
    { key: 'timezone',       type: 'string',  size: 100,   required: false },
    { key: 'updated_at',     type: 'string',  size: 30,    required: false },
  ],
};

// ── Indexes ─────────────────────────────────────────────────────────────────
const indexes = {
  journal_entries: [
    { key: 'idx_user_date', type: 'key', attributes: ['user_id', 'date'], orders: ['ASC', 'ASC'] },
  ],
  food_log_entries: [
    { key: 'idx_user_date', type: 'key', attributes: ['user_id', 'date'], orders: ['ASC', 'ASC'] },
    { key: 'idx_user_import', type: 'key', attributes: ['user_id', 'import_id'], orders: ['ASC', 'ASC'] },
  ],
  medication_entries: [
    { key: 'idx_user_date', type: 'key', attributes: ['user_id', 'date'], orders: ['ASC', 'ASC'] },
  ],
  medication_quick_buttons: [
    { key: 'idx_user', type: 'key', attributes: ['user_id'], orders: ['ASC'] },
  ],
  user_profiles: [
    { key: 'idx_user', type: 'unique', attributes: ['user_id'], orders: ['ASC'] },
    { key: 'idx_share_token', type: 'key', attributes: ['share_token'], orders: ['ASC'] },
    { key: 'idx_ingest_key', type: 'key', attributes: ['ingest_key_hash'], orders: ['ASC'] },
  ],
  health_data: [
    { key: 'idx_user_type_ts', type: 'key', attributes: ['user_id', 'type', 'timestamp'], orders: ['ASC', 'ASC', 'ASC'] },
    { key: 'idx_user_import', type: 'key', attributes: ['user_id', 'import_id'], orders: ['ASC', 'ASC'] },
    { key: 'idx_user_ts', type: 'key', attributes: ['user_id', 'timestamp'], orders: ['ASC', 'ASC'] },
  ],
  health_imports: [
    { key: 'idx_user', type: 'key', attributes: ['user_id'], orders: ['ASC'] },
    { key: 'idx_user_hash', type: 'key', attributes: ['user_id', 'file_hash'], orders: ['ASC', 'ASC'] },
  ],
  push_subscriptions: [
    { key: 'idx_user', type: 'key', attributes: ['user_id'], orders: ['ASC'] },
    { key: 'idx_endpoint', type: 'unique', attributes: ['endpoint'], orders: ['ASC'] },
  ],
  user_reminders: [
    { key: 'idx_user', type: 'unique', attributes: ['user_id'], orders: ['ASC'] },
  ],
};

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Creating database...');
  await safe(() => db.create(DB_ID, 'ArfidWatch'));
  console.log('Database ready.');

  for (const col of collections) {
    console.log(`\nCollection: ${col.name} (${col.id})`);
    await safe(() => db.createCollection(DB_ID, col.id, col.name, [
      // Document-level permissions: users read/write their own docs
    ]));

    // Create attributes
    const attrs = attributes[col.id] || [];
    for (const attr of attrs) {
      process.stdout.write(`  attr: ${attr.key} (${attr.type})...`);
      try {
        if (attr.type === 'string') {
          await safe(() => db.createStringAttribute(DB_ID, col.id, attr.key, attr.size, attr.required, attr.default));
        } else if (attr.type === 'float') {
          await safe(() => db.createFloatAttribute(DB_ID, col.id, attr.key, attr.required));
        } else if (attr.type === 'integer') {
          await safe(() => db.createIntegerAttribute(DB_ID, col.id, attr.key, attr.required));
        } else if (attr.type === 'boolean') {
          await safe(() => db.createBooleanAttribute(DB_ID, col.id, attr.key, attr.required));
        }
        console.log(' ok');
      } catch (e) {
        console.log(` ERROR: ${e.message}`);
      }
    }
  }

  // Wait for attributes to be available before creating indexes
  console.log('\nWaiting 5s for attributes to be available...');
  await new Promise(r => setTimeout(r, 5000));

  for (const col of collections) {
    const idxs = indexes[col.id] || [];
    for (const idx of idxs) {
      process.stdout.write(`  index: ${col.id}.${idx.key}...`);
      try {
        await safe(() => db.createIndex(DB_ID, col.id, idx.key, idx.type, idx.attributes, idx.orders));
        console.log(' ok');
      } catch (e) {
        console.log(` ERROR: ${e.message}`);
      }
    }
  }

  console.log('\nDone! All collections, attributes, and indexes created.');
}

main().catch(e => { console.error(e); process.exit(1); });
