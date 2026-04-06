#!/bin/bash
set -e

# ── ArfidWatch Appwrite Setup ────────────────────────────────────────────────
# This script creates the database, collections, attributes, indexes,
# deploys functions, and sets environment variables.
#
# Prerequisites:
#   1. appwrite login    (run first if session expired)
#   2. appwrite client --project-id 69d314770014fcf64eaf
#
# Usage:
#   bash scripts/setup-appwrite.sh
# ─────────────────────────────────────────────────────────────────────────────

PROJECT="69d314770014fcf64eaf"
DB="arfidwatch"

ok()   { echo "  ✓ $1"; }
skip() { echo "  – $1 (already exists)"; }
fail() { echo "  ✗ $1: $2"; }

safe() {
  local output
  if output=$("$@" 2>&1); then
    return 0
  else
    if echo "$output" | grep -qi "already exists\|duplicate\|409"; then
      return 1  # already exists
    else
      echo "$output" >&2
      return 2  # real error
    fi
  fi
}

echo "══════════════════════════════════════════════════════════"
echo " ArfidWatch — Appwrite Setup"
echo "══════════════════════════════════════════════════════════"

# ── 1. Create Database ──────────────────────────────────────────────────────
echo ""
echo "1) Creating database..."
if safe appwrite databases create --database-id "$DB" --name "ArfidWatch"; then
  ok "Database created"
else
  skip "Database $DB"
fi

# ── 2. Create Collections ──────────────────────────────────────────────────
echo ""
echo "2) Creating collections..."

create_collection() {
  local id="$1" name="$2"
  if safe appwrite databases create-collection --database-id "$DB" --collection-id "$id" --name "$name" --document-security true; then
    ok "$name"
  else
    skip "$name"
  fi
}

create_collection journal_entries "Journal Entries"
create_collection food_log_entries "Food Log Entries"
create_collection medication_entries "Medication Entries"
create_collection medication_quick_buttons "Medication Quick Buttons"
create_collection user_profiles "User Profiles"
create_collection health_data "Health Data"
create_collection health_imports "Health Imports"
create_collection push_subscriptions "Push Subscriptions"
create_collection user_reminders "User Reminders"

# ── 3. Create Attributes ───────────────────────────────────────────────────
echo ""
echo "3) Creating attributes..."

str() {
  local col="$1" key="$2" size="$3" req="${4:-false}"
  if safe appwrite databases create-string-attribute --database-id "$DB" --collection-id "$col" --key "$key" --size "$size" --required "$req"; then
    ok "$col.$key (string[$size])"
  else
    skip "$col.$key"
  fi
}

flt() {
  local col="$1" key="$2" req="${3:-false}"
  if safe appwrite databases create-float-attribute --database-id "$DB" --collection-id "$col" --key "$key" --required "$req"; then
    ok "$col.$key (float)"
  else
    skip "$col.$key"
  fi
}

int() {
  local col="$1" key="$2" req="${3:-false}"
  if safe appwrite databases create-integer-attribute --database-id "$DB" --collection-id "$col" --key "$key" --required "$req"; then
    ok "$col.$key (integer)"
  else
    skip "$col.$key"
  fi
}

bool() {
  local col="$1" key="$2" req="${3:-false}"
  if safe appwrite databases create-boolean-attribute --database-id "$DB" --collection-id "$col" --key "$key" --required "$req"; then
    ok "$col.$key (boolean)"
  else
    skip "$col.$key"
  fi
}

# journal_entries
str journal_entries user_id 64 true
str journal_entries date 10 true
str journal_entries title 500
str journal_entries text 50000
str journal_entries mood 50

# food_log_entries
str food_log_entries user_id 64 true
str food_log_entries import_id 64
str food_log_entries date 10 true
str food_log_entries meal 100
str food_log_entries food_name 500
str food_log_entries quantity 200
flt food_log_entries calories
flt food_log_entries protein_g
flt food_log_entries carbs_g
flt food_log_entries fat_g
str food_log_entries note 5000

# medication_entries
str medication_entries user_id 64 true
str medication_entries date 10 true
str medication_entries time 10
str medication_entries medication_name 300 true
str medication_entries dosage 200
str medication_entries notes 5000
str medication_entries taken_at 30
str medication_entries created_at 30

# medication_quick_buttons
str medication_quick_buttons user_id 64 true
str medication_quick_buttons medication_name 300 true
str medication_quick_buttons dosage 200
str medication_quick_buttons color 30
int medication_quick_buttons sort_order

# user_profiles
str user_profiles user_id 64 true
str user_profiles username 200
str user_profiles export_period 20
str user_profiles share_token 128
str user_profiles share_passcode_hash 256
bool user_profiles share_food_log
bool user_profiles share_food_notes
bool user_profiles share_medications
bool user_profiles share_journal
str user_profiles share_period 20
str user_profiles ingest_key_hash 256
str user_profiles ingest_key_last_used_at 30
str user_profiles health_auto_export_url 2000
str user_profiles nav_tab_order 2000
str user_profiles nav_hidden_tabs 2000
str user_profiles hidden_health_types 10000
str user_profiles health_stat_order 10000
str user_profiles med_entry_colors 5000

# health_data
str health_data user_id 64 true
str health_data type 200 true
flt health_data value
str health_data timestamp 30 true
str health_data raw 50000
str health_data import_id 64

# health_imports
str health_imports user_id 64 true
str health_imports filename 500
str health_imports source 100
str health_imports imported_at 30
int health_imports record_count
str health_imports file_hash 128

# push_subscriptions
str push_subscriptions user_id 64 true
str push_subscriptions endpoint 2000 true
str push_subscriptions p256dh 500 true
str push_subscriptions auth 500 true
str push_subscriptions created_at 30

# user_reminders
str user_reminders user_id 64 true
str user_reminders reminders_json 50000
str user_reminders timezone 100
str user_reminders updated_at 30

# ── 4. Wait for attributes, then create indexes ────────────────────────────
echo ""
echo "4) Waiting 8s for attributes to provision..."
sleep 8

echo "   Creating indexes..."

idx() {
  local col="$1" key="$2" type="$3" attrs="$4" orders="$5"
  if safe appwrite databases create-index --database-id "$DB" --collection-id "$col" --key "$key" --type "$type" --attributes "$attrs" --orders "$orders"; then
    ok "$col.$key ($type)"
  else
    skip "$col.$key"
  fi
}

idx journal_entries idx_user_date key 'user_id,date' 'ASC,ASC'
idx food_log_entries idx_user_date key 'user_id,date' 'ASC,ASC'
idx food_log_entries idx_user_import key 'user_id,import_id' 'ASC,ASC'
idx medication_entries idx_user_date key 'user_id,date' 'ASC,ASC'
idx medication_quick_buttons idx_user key 'user_id' 'ASC'
idx user_profiles idx_user unique 'user_id' 'ASC'
idx user_profiles idx_share_token key 'share_token' 'ASC'
idx user_profiles idx_ingest_key key 'ingest_key_hash' 'ASC'
idx health_data idx_user_type_ts key 'user_id,type,timestamp' 'ASC,ASC,ASC'
idx health_data idx_user_import key 'user_id,import_id' 'ASC,ASC'
idx health_data idx_user_ts key 'user_id,timestamp' 'ASC,ASC'
idx health_imports idx_user key 'user_id' 'ASC'
idx health_imports idx_user_hash key 'user_id,file_hash' 'ASC,ASC'
idx push_subscriptions idx_user key 'user_id' 'ASC'
idx push_subscriptions idx_endpoint unique 'endpoint' 'ASC'
idx user_reminders idx_user unique 'user_id' 'ASC'

# ── 5. Deploy Functions ─────────────────────────────────────────────────────
echo ""
echo "5) Deploying functions..."
cd "$(dirname "$0")/.."
appwrite deploy function --function-id api --yes
appwrite deploy function --function-id push-scheduler --yes

# ── 6. Generate VAPID keys ─────────────────────────────────────────────────
echo ""
echo "6) VAPID keys for web push..."
echo "   Run this in the server folder to generate keys:"
echo '   node -e "const w=require(\"web-push\");const k=w.generateVAPIDKeys();console.log(\"VAPID_PUBLIC_KEY=\"+k.publicKey);console.log(\"VAPID_PRIVATE_KEY=\"+k.privateKey)"'
echo ""
echo "   Then set them as environment variables on BOTH functions in the Appwrite console:"
echo "   - VAPID_PUBLIC_KEY"
echo "   - VAPID_PRIVATE_KEY"
echo ""
echo "   Also set on the 'api' function:"
echo "   - APPWRITE_API_KEY  (create at Project Settings → API Keys with databases + users scopes)"
echo ""
echo "   Also set on the 'push-scheduler' function:"
echo "   - APPWRITE_API_KEY  (same key as above)"

echo ""
echo "══════════════════════════════════════════════════════════"
echo " Setup complete! Next steps:"
echo "  1. Create an API Key in Appwrite Console → Project Settings → API Keys"
echo "     Scopes needed: databases, users, storage"
echo "  2. Set environment variables on both functions (see above)"
echo "  3. Test by visiting your app"
echo "══════════════════════════════════════════════════════════"
