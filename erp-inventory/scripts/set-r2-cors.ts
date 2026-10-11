// Définit la politique CORS du bucket R2 (dépôt navigateur direct). Usage:
//   node --experimental-strip-types --env-file=.env.local scripts/set-r2-cors.ts
import { AwsClient } from "aws4fetch";

const account = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET ?? "";

const xml = `<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>https://erp-system-rckq4hfmga-ew.a.run.app</AllowedOrigin>
    <AllowedOrigin>https://erp-system-1046319022554.europe-west1.run.app</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>content-type</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  service: "s3",
  region: "auto",
});

const res = await client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}?cors`, {
  method: "PUT",
  headers: { "content-type": "application/xml" },
  body: xml,
});
console.log("PUT CORS:", res.status);
console.log((await res.text()).slice(0, 300));
