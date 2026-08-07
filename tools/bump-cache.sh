#!/usr/bin/env bash
# Cache busting: rewrite every ?v=<stamp> in index.html with the current UTC
# timestamp. Run before EVERY push so GitHub Pages never serves stale assets.
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP=$(date -u +%Y%m%d%H%M%S)
sed -i.bak -E "s/\?v=[A-Za-z0-9]+/?v=${STAMP}/g" index.html
rm -f index.html.bak
echo "Cache stamp set to ${STAMP}"
