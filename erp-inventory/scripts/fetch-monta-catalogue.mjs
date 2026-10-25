// Recupere le catalogue montaservice.net : telecharge produits/<ref>.jpg vers
// CatalogueImages/<ref>.jpg et exporte catalogue.json (ref, designation, pvTtc, marque).
// Usage :
//   MONTA_USER=... MONTA_PASS=... node scripts/fetch-monta-catalogue.mjs [outDir]
import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://montaservice.net/web";
const outDir = process.argv[2] || "C:\\Dev\\ERP_System\\CatalogueImages";
const user = process.env.MONTA_USER ?? "";
const pass = process.env.MONTA_PASS ?? "";
if (!user || !pass) {
  console.error("MONTA_USER et MONTA_PASS requis");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const cookieOf = (res) =>
  (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

let cookie = "";
const req = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
    redirect: "manual",
  });
  const c = cookieOf(res);
  if (c) cookie = [cookie, c].filter(Boolean).join("; ");
  return res;
};

// --- login ---
const login = await req(`${BASE}/index.php?page=login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ login: user, mp: pass, id: "1" }),
});
if (!cookie.includes("PHPSESSID")) {
  console.error("Echec login (pas de PHPSESSID)", login.status);
  process.exit(1);
}
const home = await req(`${BASE}/index.php?page=index`);
if (!(await home.text()).match(/D.connexion/i)) {
  console.error("Echec login (pas de marqueur de session)");
  process.exit(1);
}
console.log("Login OK");

// --- catalogue ---
const page = await req(`${BASE}/index.php?page=produits`);
const html = await page.text();
if (html.length < 100_000) {
  console.error("Page produits inattendue:", html.length, "octets");
  process.exit(1);
}

const rows = [];
const re =
  /<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td><img[^>]*src="(produits\/[^"]+)"[^>]*><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g;
let m;
while ((m = re.exec(html))) {
  rows.push({
    ref: m[1],
    photo: m[2],
    designation: m[3].trim(),
    pvTtc: m[4].trim().replace(",", "."),
    marque: m[5].trim(),
  });
}
console.log(rows.length, "produits extraits");
if (rows.length === 0) {
  console.error("Aucune ligne extraite — verifier le regex");
  process.exit(1);
}
writeFileSync(
  join(outDir, "catalogue.json"),
  JSON.stringify(rows, null, 2)
);

// --- images ---
let ok = 0;
let skip = 0;
let fail = 0;
for (const r of rows) {
  const ext = r.photo.split(".").pop();
  const dest = join(outDir, `${r.ref}.${ext}`);
  if (existsSync(dest) && statSync(dest).size > 0) {
    skip++;
    continue;
  }
  const img = await req(`${BASE}/${r.photo}`);
  if (!img.ok) {
    fail++;
    console.log("  img fail", r.ref, img.status);
    continue;
  }
  writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
  ok++;
}
console.log(`Images: ${ok} telechargees, ${skip} deja presentes, ${fail} echecs`);
console.log("catalogue.json ->", join(outDir, "catalogue.json"));
