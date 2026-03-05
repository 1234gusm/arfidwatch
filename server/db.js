const knex = require('knex');
const path = require('path');

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: path.resolve(__dirname, 'data', 'health.db'),
  },
  useNullAsDefault: true,
});

// ensure tables exist
async function setup() {
  await db.schema.hasTable('users').then(exists => {
    if (!exists) {
      return db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('username').unique().notNullable();
        table.string('password').notNullable();
      });
    }
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

  // Performance indexes for frequent import, dedupe, and lookup queries.
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_data_user_type_ts ON health_data(user_id, type, timestamp)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_data_user_import ON health_data(user_id, import_id)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_imports_user_source_hash ON health_imports(user_id, source, file_hash)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_health_imports_user_imported_at ON health_imports(user_id, imported_at)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_food_log_user_import_date ON food_log_entries(user_id, import_id, date)');
}

setup();

module.exports = db;
