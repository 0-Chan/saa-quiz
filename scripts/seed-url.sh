#!/bin/sh
# Print a fresh presigned URL for the private question bundle (rotate by re-running).
# Usage: SAA_SEED_BUCKET=<bucket> [AWS_PROFILE=<profile>] [EXPIRES=<seconds, default 604800>] scripts/seed-url.sh
# Then: export SAA_SEED_URL="<printed url>"   — never commit or publish this URL.
set -eu
: "${SAA_SEED_BUCKET:?set SAA_SEED_BUCKET}"
exec aws s3 presign "s3://${SAA_SEED_BUCKET}/${SAA_SEED_KEY:-seed-v1.json}" --expires-in "${EXPIRES:-604800}"
