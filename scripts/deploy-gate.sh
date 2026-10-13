#!/bin/sh
# Create or update the access-code gate (Lambda Function URL) in front of the private question bundle.
# Usage: SAA_SEED_BUCKET=<bucket> [SAA_SEED_KEY=seed-v1.json] [AWS_PROFILE=…] [AWS_REGION=…] scripts/deploy-gate.sh
# Prints the Function URL. Set the code afterwards with scripts/set-code.sh.
set -eu
: "${SAA_SEED_BUCKET:?set SAA_SEED_BUCKET}"
KEY="${SAA_SEED_KEY:-seed-v1.json}"
FN=saa-quiz-seed-gate
ROLE=saa-quiz-seed-gate
DIR=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --output text --query Role.Arn --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # let the new role propagate before Lambda uses it
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name read-seed --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::${SAA_SEED_BUCKET}/${KEY}\"}]}"

(cd "$DIR/infra/seed-gate" && zip -q "$TMP/gate.zip" index.mjs)

if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$TMP/gate.zip" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  # Keep the existing CODE_SHA256 while updating BUCKET/KEY.
  HASH=$(aws lambda get-function-configuration --function-name "$FN" --query 'Environment.Variables.CODE_SHA256' --output text)
  aws lambda update-function-configuration --function-name "$FN" \
    --environment "Variables={BUCKET=${SAA_SEED_BUCKET},KEY=${KEY},CODE_SHA256=${HASH}}" >/dev/null
else
  aws lambda create-function --function-name "$FN" --runtime nodejs20.x --handler index.handler \
    --role "$ROLE_ARN" --zip-file "fileb://$TMP/gate.zip" --timeout 10 --memory-size 256 \
    --environment "Variables={BUCKET=${SAA_SEED_BUCKET},KEY=${KEY},CODE_SHA256=none}" >/dev/null
fi
aws lambda wait function-updated --function-name "$FN"

if ! aws lambda get-function-url-config --function-name "$FN" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-url --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-invoke --action lambda:InvokeFunction \
    --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true
fi
aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text
