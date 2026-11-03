// Recupere des pages du legacy montaservice.net et sauvegarde le HTML brut
// dans References_/legacy-pages/<page>.html pour analyse (jamais commite).
// Usage :
//   MONTA_USER=... MONTA_PASS=... node scripts/fetch-legacy-pages.mjs [page1 page2 ...]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://montaservice.net/web";
const outDir = "C:\\Dev\\ERP_System\\References_\\legacy-pages";
const user = process.env.MONTA_USER ?? "";
const pass = process.env.MONTA_PASS ?? "";
if (!user || !pass) {
  console.error("MONTA_USER et MONTA_PASS requis");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const cookieOf = (res) =>
  (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

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

const login = await req(`${BASE}/index.php?page=login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ login: user, mp: pass, id: "1" }),
});
if (!cookie.includes("PHPSESSID")) {
  console.error("Echec login", login.status);
  process.exit(1);
}
console.log("Login OK");

const pages = process.argv.slice(2);
for (const p of pages) {
  const res = await req(`${BASE}/index.php?page=${p}`);
  const html = await res.text();
  const file = join(outDir, `${p.replace(/[^\w-]/g, "_")}.html`);
  writeFileSync(file, html);
  const denied = /acc.s|denied|permission|interdit/i.test(html.slice(0, 3000));
  console.log(`${p}: ${res.status} ${html.length}B${denied ? " [possible deny]" : ""}`);
}
