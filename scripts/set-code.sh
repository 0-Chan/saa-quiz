#!/bin/sh
# Set (rotate) the access code. Only its SHA-256 is stored, in the Lambda's CODE_SHA256; the code is printed here only.
# Usage: [AWS_PROFILE=…] [AWS_REGION=…] scripts/set-code.sh [code]   (no code → random "word-word-word-00")
# Never commit or publish the code.
set -eu
FN=saa-quiz-seed-gate
if [ $# -gt 0 ]; then
  CODE="$1"
else
  WORDS="crab tiger blue river cloud stone maple orbit lemon panda rocket cedar coral ember frost glide harbor ivory jade koala lunar mango nova olive pearl quartz raven solar tulip violet walnut zebra amber bison comet delta falcon garnet hazel iris apple badge candle dragon eagle forest ginger honey island jungle kettle ladder magnet needle ocean pepper quiet rabbit saddle tunnel umbrella valley wagon yellow anchor basket cactus dolphin engine feather glacier hammer igloo jacket kiwi lantern meadow nectar oyster parrot quilt ribbon spider tomato urchin vessel willow canyon summit lotus bamboo pixel cobalt marble violin cherry breeze lobster hollow saturn"
  CODE=$(node -e '
    const w = process.argv[1].split(" "), r = require("node:crypto").randomInt;
    console.log([0, 1, 2].map(() => w[r(w.length)]).join("-") + "-" + String(r(100)).padStart(2, "0"));' "$WORDS")
fi
# Same normalization as src/util/code.ts and infra/seed-gate/index.mjs.
NORM=$(node -e 'console.log(process.argv[1].trim().toLowerCase().replace(/\s+/g, "-"))' "$CODE")
HASH=$(printf %s "$NORM" | shasum -a 256 | cut -d' ' -f1)
VARS=$(aws lambda get-function-configuration --function-name "$FN" --query 'Environment.Variables' --output json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);v.CODE_SHA256=process.argv[1];
    console.log(JSON.stringify({Variables:v}))})' "$HASH")
aws lambda update-function-configuration --function-name "$FN" --environment "$VARS" >/dev/null
aws lambda wait function-updated --function-name "$FN"
echo "새 접근 코드: $NORM"
