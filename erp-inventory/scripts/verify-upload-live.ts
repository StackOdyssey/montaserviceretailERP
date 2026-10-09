// Test live du dépôt présigné R2 → GET public → DELETE. Usage:
//   node --experimental-strip-types --env-file=.env.local scripts/verify-upload-live.ts
import { AwsClient } from "aws4fetch";
import { createPresignedUpload } from "../src/lib/storage.ts";

const account = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";

// 1x1 transparent PNG (an image, since only image types are allowed).
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const { key, uploadUrl, publicUrl } = await createPresignedUpload("image/png", png.length);
console.log("presigned key:", key);

const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: png });
console.log("PUT:", put.status);

const get = await fetch(publicUrl);
const got = Buffer.from(await get.arrayBuffer());
console.log("GET public:", get.status, "bytes:", got.length, "match:", got.equals(png));

const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
const del = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`, { method: "DELETE" });
console.log("DELETE cleanup:", del.status);
