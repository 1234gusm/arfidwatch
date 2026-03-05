#!/usr/bin/env bash
set -e

echo "== Starting automated verification script =="

# Register user (or login if exists)
REG=$(curl -s -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"username":"e2e_test","password":"testpass"}' || true)
if echo "$REG" | grep -q token; then
  TOKEN=$(echo "$REG" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  echo "Registered new user, token obtained"
else
  echo "Register response: $REG"
  LOGIN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"username":"e2e_test","password":"testpass"}')
  echo "Login response: $LOGIN"
  TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -z "$TOKEN" ]; then
    echo "Failed to register/login; aborting"
    exit 1
  fi
fi

echo "TOKEN length: ${#TOKEN}"

# Create a journal entry
CREATED=$(curl -s -X POST http://localhost:4000/api/journal -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"date":"2026-03-04T12:00:00Z","text":"e2e test entry","mood":4}')
echo "Create entry response: $CREATED"

# List entries
LIST=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/journal)
echo "List response: $LIST"
ID=$(echo "$LIST" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n1)
if [ -z "$ID" ]; then
  echo "No entry id found; aborting delete test"
else
  echo "Found entry ID: $ID"
  echo "Attempting delete..."
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/journal/$ID
fi

# Import sample Health Auto Export CSV via JSON endpoint
CSV_SAMPLE='startDate,type,value\n2026-03-04T09:00:00Z,steps,1000\n2026-03-04T10:00:00Z,heart_rate,72'
IMPORT_RESP=$(curl -s -X POST http://localhost:4000/api/health/import -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"csv\": \"$CSV_SAMPLE\"}")
echo "Health CSV import response: $IMPORT_RESP"

# Verify health entries
HEALTH_LIST=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/health)
echo "Health GET response: $HEALTH_LIST"

# Create macro CSV file and upload
MACRO_FILE="/tmp/macro_e2e.csv"
cat > "$MACRO_FILE" <<'EOF'
food,calories,protein
apple,95,0
banana,105,1
EOF
MACRO_RESP=$(curl -s -F file=@"$MACRO_FILE" -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/health/macro/import)
echo "Macro import response: $MACRO_RESP"

# PDF export (day)
PDF_OUT="/tmp/journal_day_e2e.pdf"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/journal/export?period=day" -o "$PDF_OUT"
if [ -f "$PDF_OUT" ]; then
  echo "PDF saved to $PDF_OUT (size: $(stat -f%z "$PDF_OUT" 2>/dev/null || stat -c%s "$PDF_OUT" 2>/dev/null))"
else
  echo "PDF not created"
fi

echo "== Automated verification completed ==" 
