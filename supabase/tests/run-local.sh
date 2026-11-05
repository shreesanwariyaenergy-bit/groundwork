#!/usr/bin/env bash
# Apply all migrations to a throwaway local database and run the SQL test suite.
# Usage: bash supabase/tests/run-local.sh   (needs psql + a local postgres superuser)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${GW_TEST_DB:-groundwork_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
run() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "dropdb --if-exists $DB && createdb $DB"
run "${PSQL[*]} -d $DB -f '$DIR/tests/00_supabase_shim.sql'"
for f in "$DIR"/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  run "${PSQL[*]} -d $DB -f '$f'"
done
for f in "$DIR"/tests/[1-9]*.sql; do
  echo "→ test $(basename "$f")"
  run "${PSQL[*]} -d $DB -f '$f'" > /dev/null
done
echo "All database tests passed."
