const knex = require('knex');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const defaultDbPath = isProduction
  ? '/var/data/health.db'
  : path.resolve(__dirname, 'data', 'health.db');
const configuredDbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : defaultDbPath;

let activeDbPath = configuredDbPath;

function ensureWritableDbPath(dbPath) {
  const dbDirPath = path.dirname(dbPath);
  fs.mkdirSync(dbDirPath, { recursive: true });
  fs.accessSync(dbDirPath, fs.constants.W_OK);
}

try {
  ensureWritableDbPath(activeDbPath);
} catch (err) {
  if (isProduction && process.env.SQLITE_ALLOW_EPHEMERAL !== 'true') {
    throw new Error(
      `SQLite path is not writable at ${activeDbPath}. In production attach a persistent disk at /var/data or set SQLITE_PATH to a writable persistent location.`
    );
  }
  console.warn(`SQLite path not writable at ${activeDbPath}. Falling back to ${defaultDbPath}.`);
  activeDbPath = defaultDbPath;
  ensureWritableDbPath(activeDbPath);
}

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: activeDbPath,
  },
  useNullAsDefault: true,
});

console.log(`SQLite DB path: ${activeDbPath}`);

// ensure tables exist
async function setup() {
  await db.schema.hasTable('users').then(exists => {
    if (!exists) {
      return db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('username').unique().notNullable();
        table.string('password').notNullable();
        table.string('email').nullable();
        table.string('reset_token').nullable();
        table.datetime('reset_token_expires').nullable();
        table.string('reset_code_hash').nullable();
        table.datetime('reset_code_expires').nullable();
      });
    }
  });
  await db.schema.hasColumn('users', 'email').then(exists => {
    if (!exists) return db.schema.table('users', t => t.string('email').nullable());
  });
  await db.schema.hasColumn('users', 'reset_token').then(exists => {
    if (!exists) return db.schema.table('users', t => t.string('reset_token').nullable());
  });
  await db.schema.hasColumn('users', 'reset_token_expires').then(exists => {
    if (!exists) return db.schema.table('users', t => t.datetime('reset_token_expires').nullable());
  });
  await db.schema.hasColumn('users', 'reset_code_hash').then(exists => {
    if (!exists) return db.schema.table('users', t => t.string('reset_code_hash').nullable());
  });
  await db.schema.hasColumn('users', 'reset_code_expires').then(exists => {
    if (!exists) return db.schema.table('users', t => t.datetime('reset_code_expires').nullable());
  });
  await db.schema.hasTable('health_data').then(exists => {
    if (!exists) {
      return db.schema.createTable('health_data', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.string('type');
        table.float('value');
        table.datetime('timestamp');
        table.json('raw');
      });
    }
  });
  await db.schema.hasTable('journal_entries').then(exists => {
    if (!exists) {
      return db.schema.createTable('journal_entries', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.datetime('date');
        table.text('text');
        table.integer('mood');
      });
    }
  });
  await db.schema.hasTable('health_imports').then(exists => {
    if (!exists) {
      return db.schema.createTable('health_imports', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.string('filename');
        table.string('source'); // 'health' or 'macro'
        table.string('file_hash').nullable(); // sha256 of uploaded file bytes
        table.datetime('imported_at');
        table.integer('record_count');
      });
    }
  });
  await db.schema.hasColumn('health_imports', 'file_hash').then(exists => {
    if (!exists) return db.schema.table('health_imports', t => t.string('file_hash').nullable());
  });
  // Add import_id to health_data if the column doesn't exist yet
  await db.schema.hasColumn('health_data', 'import_id').then(exists => {
    if (!exists) {
      return db.schema.table('health_data', t => t.integer('import_id').nullable());
    }
  });
  // Add title to journal_entries if the column doesn't exist yet
  await db.schema.hasColumn('journal_entries', 'title').then(exists => {
    if (!exists) {
      return db.schema.table('journal_entries', t => t.string('title').nullable());
    }
  });
  await db.schema.hasTable('user_profiles').then(exists => {
    if (!exists) {
      return db.schema.createTable('user_profiles', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users').unique();
        table.string('export_period').defaultTo('week');
        table.string('share_token').nullable();
        table.string('share_passcode_hash').nullable();
      });
    }
  });
  await db.schema.hasColumn('user_profiles', 'share_token').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.string('share_token').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'share_passcode_hash').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.string('share_passcode_hash').nullable());
  });
  await db.schema.hasTable('food_log_entries').then(exists => {
    if (!exists) {
      return db.schema.createTable('food_log_entries', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.integer('import_id').nullable();  // which health_imports row produced this
        table.string('date');       // YYYY-MM-DD
        table.string('meal');
        table.text('food_name');
        table.string('quantity');
        table.float('calories');
        table.float('protein_g');
        table.float('carbs_g');
        table.float('fat_g');
      });
    }
  });
  // Add import_id to food_log_entries if it didn't exist before this migration
  await db.schema.hasColumn('food_log_entries', 'import_id').then(exists => {
    if (!exists) return db.schema.table('food_log_entries', t => t.integer('import_id').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'share_food_log').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.boolean('share_food_log').defaultTo(false));
  });
  await db.schema.hasColumn('user_profiles', 'ingest_key_hash').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.string('ingest_key_hash').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'ingest_key_last_used_at').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.datetime('ingest_key_last_used_at').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'share_medications').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.boolean('share_medications').defaultTo(false));
  });
  await db.schema.hasColumn('user_profiles', 'share_journal').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.boolean('share_journal').defaultTo(false));
  });
  await db.schema.hasColumn('user_profiles', 'health_auto_export_url').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('health_auto_export_url').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'nav_tab_order').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('nav_tab_order').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'nav_hidden_tabs').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('nav_hidden_tabs').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'hidden_health_types').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('hidden_health_types').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'health_stat_order').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('health_stat_order').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'med_entry_colors').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.text('med_entry_colors').nullable());
  });

  await db.schema.hasTable('medication_entries').then(exists => {
    if (!exists) {
      return db.schema.createTable('medication_entries', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.string('date'); // YYYY-MM-DD
        table.string('time'); // HH:mm (optional)
        table.string('medication_name').notNullable();
        table.string('dosage').nullable();
        table.text('notes').nullable();
        table.datetime('taken_at').notNullable();
        table.datetime('created_at').notNullable();
      });
    }
  });

  await db.schema.hasTable('medication_quick_buttons').then(exists => {
    if (!exists) {
      return db.schema.createTable('medication_quick_buttons', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users');
        table.string('medication_name').notNullable();
        table.string('dosage').nullable();
        table.string('color').notNullable().defaultTo('#0a66c2');
        table.integer('sort_order').notNullable().defaultTo(0);
        table.datetime('created_at').notNullable();
      });
    }
  });

  // Performance indexes for frequent import, dedupe, and lookup queries.
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_data_user_type_ts ON health_data(user_id, type, timestamp)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_data_user_import ON health_data(user_id, import_id)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_imports_user_source_hash ON health_imports(user_id, source, file_hash)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_imports_user_imported_at ON health_imports(user_id, imported_at)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_food_log_user_import_date ON food_log_entries(user_id, import_id, date)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_user_profiles_ingest_key_hash ON user_profiles(ingest_key_hash)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_medication_entries_user_date ON medication_entries(user_id, date)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_medication_entries_user_taken_at ON medication_entries(user_id, taken_at)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_med_quick_buttons_user_order ON medication_quick_buttons(user_id, sort_order)');
  await db.raw('CREATE UNIQUE INDEX IF NOT EXISTS uq_med_quick_buttons_user_name_dose ON medication_quick_buttons(user_id, medication_name, IFNULL(dosage, ""))');
}

setup();

module.exports = db;
