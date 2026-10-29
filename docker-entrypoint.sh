#!/bin/sh
# Bring the database schema up to date on the mounted volume, seed the exercise library
# (idempotent), then start Next.js.
set -e

if [ -z "$AUTH_SECRET" ]; then
  echo "AUTH_SECRET is not set. Set it to a random string of 32+ characters." >&2
  exit 1
fi

mkdir -p "$UPLOAD_DIR"
npx prisma db push --skip-generate
npx tsx prisma/seed.ts

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
