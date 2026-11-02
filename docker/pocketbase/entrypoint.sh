#!/bin/sh
set -e

PB="/pb/pocketbase"
OPTS="--dir=/pb/pb_data --migrationsDir=/pb/pb_migrations"

# Optionally create/update the superuser (dashboard admin) from env vars.
# "upsert" is safe to run on every start: it creates the account or updates its password.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  echo "Ensuring superuser $PB_ADMIN_EMAIL exists..."
  $PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" $OPTS
else
  echo "PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD not set: create the superuser via the install link printed below."
fi

# Pending migrations (including the pb_schema.json import) are applied on startup.
exec $PB serve --http=0.0.0.0:8090 $OPTS "$@"
