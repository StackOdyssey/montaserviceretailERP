import { AwsClient } from "aws4fetch";
import { createPresignedUpload } from "../src/lib/storage.ts";

const account = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

const { key, uploadUrl } = await createPresignedUpload("image/png", png.length);
const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: png });
console.log("PUT:", put.status);

const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
url.searchParams.set("X-Amz-Expires", "600");
const signed = await client.sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
const get = await fetch(signed.url);
const buf = Buffer.from(await get.arrayBuffer());
console.log("GET signed:", get.status, "bytes:", buf.length, "match:", buf.equals(png));

const del = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`, { method: "DELETE" });
console.log("DELETE:", del.status);
