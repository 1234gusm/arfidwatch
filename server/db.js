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

// Try the configured path first, then fall back gracefully instead of crashing.
let usingEphemeral = false;
try {
  ensureWritableDbPath(activeDbPath);
} catch (err) {
  console.warn(`[DB] Cannot write to ${activeDbPath}: ${err.message}`);
  // Try the default production path as a second attempt
  if (activeDbPath !== defaultDbPath) {
    try {
      activeDbPath = defaultDbPath;
      ensureWritableDbPath(activeDbPath);
      console.warn(`[DB] Fell back to ${activeDbPath}`);
    } catch {
      // Last resort: in-memory (ephemeral) so the server can still start
      activeDbPath = ':memory:';
      usingEphemeral = true;
      console.warn('[DB] Disk not writable anywhere \u2014 using ephemeral in-memory database. Data will NOT persist across restarts.');
    }
  } else {
    activeDbPath = ':memory:';
    usingEphemeral = true;
    console.warn('[DB] Disk not writable \u2014 using ephemeral in-memory database. Data will NOT persist across restarts.');
  }
}

const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: activeDbPath,
  },
  useNullAsDefault: true,
});

console.log(`SQLite DB path: ${activeDbPath}${usingEphemeral ? ' (EPHEMERAL)' : ''}`);

// Wrap setup() so a migration failure doesn't crash the server
async function setup() {
  try {
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
  await db.schema.hasColumn('food_log_entries', 'note').then(exists => {
    if (!exists) return db.schema.table('food_log_entries', t => t.text('note').nullable());
  });
  await db.schema.hasColumn('user_profiles', 'share_food_notes').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.boolean('share_food_notes').defaultTo(true));
  });
  // Flip existing users to share_food_notes = true (new default)
  await db('user_profiles').where({ share_food_notes: false }).update({ share_food_notes: true });

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

  // Web Push tables
  await db.schema.hasTable('server_config').then(exists => {
    if (!exists) {
      return db.schema.createTable('server_config', table => {
        table.string('key').primary();
        table.text('value');
      });
    }
  });

  await db.schema.hasTable('push_subscriptions').then(exists => {
    if (!exists) {
      return db.schema.createTable('push_subscriptions', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users').notNullable();
        table.text('endpoint').notNullable().unique();
        table.text('p256dh').notNullable();
        table.text('auth').notNullable();
        table.datetime('created_at');
      });
    }
  });

  await db.schema.hasTable('user_reminders').then(exists => {
    if (!exists) {
      return db.schema.createTable('user_reminders', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users').notNullable().unique();
        table.text('reminders_json').notNullable().defaultTo('[]');
        table.string('timezone').notNullable().defaultTo('UTC');
        table.datetime('updated_at');
      });
    }
  });
  // Tasks table
  await db.schema.hasTable('tasks').then(exists => {
    if (!exists) {
      return db.schema.createTable('tasks', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users').notNullable();
        table.string('title', 500).notNullable();
        table.text('notes').nullable();
        table.string('due_date').nullable();   // YYYY-MM-DD
        table.string('due_time').nullable();   // HH:mm
        table.integer('priority').notNullable().defaultTo(0); // 0=none,1=low,2=med,3=high
        table.string('list_name', 100).notNullable().defaultTo('Inbox');
        table.boolean('completed').notNullable().defaultTo(false);
        table.datetime('completed_at').nullable();
        table.integer('sort_order').notNullable().defaultTo(0);
        table.integer('parent_id').nullable();
        table.string('recurrence').nullable();  // daily|weekly|monthly|weekdays or null
        table.datetime('created_at').notNullable();
        table.datetime('updated_at').notNullable();
      });
    }
  });
  await db.schema.hasColumn('tasks', 'parent_id').then(exists => {
    if (!exists) return db.schema.table('tasks', t => t.integer('parent_id').nullable());
  });
  await db.schema.hasColumn('tasks', 'recurrence').then(exists => {
    if (!exists) return db.schema.table('tasks', t => t.string('recurrence').nullable());
  });
  await db.raw('CREATE INDEX IF NOT EXISTS idx_tasks_user_list ON tasks(user_id, list_name)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date)');
  await db.raw('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)');

  // Theme preference
  await db.schema.hasColumn('user_profiles', 'theme').then(exists => {
    if (!exists) return db.schema.table('user_profiles', t => t.string('theme').nullable().defaultTo('dark'));
  });

  // Medical Visits (ER, doctor, specialist, etc.)
  await db.schema.hasTable('medical_visits').then(exists => {
    if (!exists) {
      return db.schema.createTable('medical_visits', table => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('users').notNullable();
        table.string('date').notNullable();            // YYYY-MM-DD
        table.string('visit_type').notNullable();      // er, doctor, specialist, urgent_care, telehealth
        table.string('facility').nullable();
        table.string('provider').nullable();
        table.string('specialty').nullable();           // Cardiology, PCP, Psychiatry, etc.
        table.text('chief_complaint').nullable();
        table.text('diagnoses_json').nullable();        // JSON array of strings
        table.text('vitals_json').nullable();           // JSON {bp, hr, resp, spo2, temp}
        table.text('labs_json').nullable();             // JSON array of lab panels
        table.text('ecgs_json').nullable();             // JSON array of ECG results
        table.text('notes').nullable();                 // Provider notes / clinical course
        table.string('disposition').nullable();         // Discharge, Admit, Follow-up, etc.
        table.text('follow_up').nullable();
        table.text('medications_json').nullable();      // JSON array of med changes
        table.datetime('created_at').notNullable();
      });
    }
  });

  // Auto-seed April 4 ER visit if medical_visits is empty for user 1
  try {
    const existing = await db('medical_visits').where({ user_id: 1 }).first();
    if (!existing) {
      const user1 = await db('users').where({ id: 1 }).first();
      if (user1) {
        await db('medical_visits').insert({
          user_id: 1,
          date: '2026-04-04',
          visit_type: 'er',
          facility: 'Novant Health Presbyterian Medical Center (NHPMC)',
          provider: 'Jason Levi, PA-C (attending: Jerry Nix, MD)',
          specialty: 'Emergency Medicine',
          chief_complaint: 'Tachycardia / SVT — HR 120-140 for days, palpitations, found in SVT at triage (158 BPM)',
          diagnoses_json: JSON.stringify(['Supraventricular tachycardia (SVT)', 'Tachycardia', 'Anxiety', 'Poor appetite / ARFID']),
          vitals_json: JSON.stringify({ BP: '168/95 mmHg', HR: '158 bpm (triage)', Resp: '18 /min', SpO2: '98%', Temp: '98.1°F', Weight: '60.1 kg (132.5 lb)', BMI: '20.84' }),
          labs_json: JSON.stringify([
            { name: 'RBC', value: '4.33', range: '4.50-5.90 M/uL', flag: 'LOW' },
            { name: 'Hemoglobin', value: '12.6', range: '14.0-17.5 g/dL', flag: 'LOW' },
            { name: 'Hematocrit', value: '37.9', range: '40.0-54.0 %', flag: 'LOW' },
            { name: 'Platelets', value: '124', range: '150-400 K/uL', flag: 'LOW' },
            { name: 'WBC', value: '5.3', range: '3.8-10.8 K/uL', flag: '' },
            { name: 'MCV', value: '87.5', range: '80.0-100.0 fL', flag: '' },
            { name: 'MCH', value: '29.1', range: '27.0-33.0 pg', flag: '' },
            { name: 'MCHC', value: '33.2', range: '32.0-36.0 g/dL', flag: '' },
            { name: 'RDW', value: '12.8', range: '11.0-15.0 %', flag: '' },
            { name: 'Neutrophils %', value: '57.3', range: '40-80 %', flag: '' },
            { name: 'Lymphocytes %', value: '30.0', range: '15-45 %', flag: '' },
            { name: 'Monocytes %', value: '8.7', range: '0-12 %', flag: '' },
            { name: 'Eosinophils %', value: '3.2', range: '0-7 %', flag: '' },
            { name: 'Basophils %', value: '0.8', range: '0-2 %', flag: '' },
            { name: 'Glucose', value: '105', range: '74-106 mg/dL', flag: '' },
            { name: 'BUN', value: '11', range: '7-20 mg/dL', flag: '' },
            { name: 'Creatinine', value: '0.81', range: '0.70-1.30 mg/dL', flag: '' },
            { name: 'Sodium', value: '139', range: '136-145 mmol/L', flag: '' },
            { name: 'Potassium', value: '3.8', range: '3.5-5.1 mmol/L', flag: '' },
            { name: 'Chloride', value: '103', range: '98-107 mmol/L', flag: '' },
            { name: 'CO2', value: '24', range: '21-31 mmol/L', flag: '' },
            { name: 'Calcium', value: '9.4', range: '8.6-10.3 mg/dL', flag: '' },
            { name: 'Total Protein', value: '7.3', range: '6.0-8.0 g/dL', flag: '' },
            { name: 'Albumin', value: '4.5', range: '3.5-5.0 g/dL', flag: '' },
            { name: 'Bilirubin Total', value: '0.6', range: '0.2-1.3 mg/dL', flag: '' },
            { name: 'Alk Phos', value: '59', range: '38-126 U/L', flag: '' },
            { name: 'AST', value: '19', range: '10-40 U/L', flag: '' },
            { name: 'ALT', value: '20', range: '9-46 U/L', flag: '' },
            { name: 'eGFR', value: '>60', range: '>60 mL/min', flag: '' },
            { name: 'Magnesium', value: '1.9', range: '1.6-2.3 mg/dL', flag: '' },
            { name: 'TSH', value: '3.320', range: '0.358-3.740 uIU/mL', flag: '' },
          ]),
          ecgs_json: JSON.stringify([
            { time: '2:36 AM', rate: 162, interpretation: 'Sinus tachycardia vs SVT, QTc 499ms (prolonged)', critical: true },
            { time: '2:46 AM', rate: 132, interpretation: 'Sinus tachycardia, QTc 420ms (normal), post-spontaneous conversion', critical: false },
          ]),
          notes: `Chief Complaint: Tachycardia, Palpitations\n\nClinical Course:\n- Patient arrived via personal vehicle at 02:09. Found in SVT at triage (HR 158).\n- Moved to Room 2. Cardiac defib pads placed. IV access established.\n- Adenosine was being prepared — the anxiety/anticipation of adenosine triggered a vagal response and patient spontaneously converted to sinus tachycardia.\n- Post-conversion: HR ~130s, then stabilized to ~100s over observation.\n- 0.5L normal saline IV given.\n- Observed ~3 hours. Labs drawn: CBC, CMP, Magnesium, TSH — all returned.\n- CBC showed low RBC (4.33), Hgb (12.6), Hct (37.9), Plt (124).\n- CMP, Mg, TSH all within normal limits.\n- Two 12-lead ECGs obtained (see ECG data).\n\nHistory:\n- ARFID (Avoidant Restrictive Food Intake Disorder) — very poor oral intake\n- Anxiety disorder with panic attacks\n- History of tachycardia episodes\n- Takes Quetiapine 200mg QHS, Lorazepam 1mg TID, Cyproheptadine 4mg, Ondansetron 4mg PRN\n\nProvider Note (Jason Levi, PA-C):\n"Initial EKG shows SVT. We were about to give adenosine when he spontaneously converted. The repeat EKG showed sinus tachycardia. The patient's heart rate improved with IV fluids and observation."\n\nAssessment: 23 y.o. male with ARFID, anxiety, presenting with SVT that spontaneously converted. Low CBC values likely secondary to nutritional deficiency (ARFID). Recommend cardiology follow-up.`,
          disposition: 'Discharged — stable, improved',
          follow_up: 'Cardiology ASAP — Oktay F. Rifki, MD PhD, 125 Queens Rd Suite 200, Charlotte NC 28204, 704-343-9800',
          medications_json: JSON.stringify(['Cyproheptadine 4mg', 'Lorazepam 1mg TID', 'Multivitamin daily', 'Ondansetron 4mg PRN nausea', 'Quetiapine 200mg QHS']),
          created_at: new Date().toISOString(),
        });
        console.log('[DB] Auto-seeded April 4 ER visit');
      }
    }
  } catch (seedErr) {
    console.error('[DB] ER visit seed error (non-fatal):', seedErr.message);
  }

  } catch (e) {
    console.error('[DB] Migration/setup error (server stays up):', e.message);
  }
}

setup();

module.exports = db;
module.exports.dbDiag = { path: activeDbPath, ephemeral: usingEphemeral };
