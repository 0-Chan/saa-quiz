// Access-code gate for the private question bundle. Deployed as a Lambda Function URL by scripts/deploy-gate.sh.
// POST {"code": "..."} → 200 bundle JSON when sha256(normalized code) matches CODE_SHA256, otherwise 403 after 1s.
import { createHash, timingSafeEqual } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep in sync with src/util/code.ts.
const normalize = (code) => String(code ?? "").trim().toLowerCase().replace(/\s+/g, "-");
const sha256 = (s) => createHash("sha256").update(s).digest();

function matches(code) {
  const expected = Buffer.from(process.env.CODE_SHA256 ?? "", "hex");
  const actual = sha256(normalize(code));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method !== "POST") return { statusCode: 405, body: "POST only" };
  let code;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body;
    code = JSON.parse(raw ?? "{}").code;
  } catch {
    return { statusCode: 400, body: "bad request" };
  }
  if (!matches(code)) {
    await sleep(1000);
    return { statusCode: 403, body: "forbidden" };
  }
  const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.BUCKET, Key: process.env.KEY }));
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: await obj.Body.transformToString() };
};
