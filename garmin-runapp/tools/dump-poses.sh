#!/bin/bash
# Writes garmin-runapp/bin/poses.json from supabase/functions/_shared/exercisePoses.ts (input of tools/figure_preview.py).
cd "$(dirname "$0")/../.." || exit 1
mkdir -p garmin-runapp/bin
npx esbuild supabase/functions/_shared/exercisePoses.ts --bundle --format=cjs --outfile=garmin-runapp/bin/poses.cjs --log-level=error || exit 1
node -e "process.stdout.write(JSON.stringify(require('./garmin-runapp/bin/poses.cjs').MOVES))" > garmin-runapp/bin/poses.json
