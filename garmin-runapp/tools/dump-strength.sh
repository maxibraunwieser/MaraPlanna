#!/bin/bash
# Writes garmin-runapp/bin/strength.cjs from supabase/functions/_shared/strength.ts (input of tools/gen-demo-strength.cjs).
cd "$(dirname "$0")/../.." || exit 1
mkdir -p garmin-runapp/bin
npx esbuild supabase/functions/_shared/strength.ts --bundle --format=cjs --outfile=garmin-runapp/bin/strength.cjs --log-level=error
