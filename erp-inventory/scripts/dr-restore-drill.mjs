// Restore drill : crée une branche de restauration depuis `production`, vérifie
// l'intégrité des données, puis supprime la branche. Usage :
//   node scripts/dr-restore-drill.mjs
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const proj = process.env.NEON_PROJECT_ID || "twilight-pine-29350562";
const source = process.env.DRILL_SOURCE_BRANCH || "production";
const name = `drill-${Date.now()}`;
const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

console.log(`[drill] création de la branche de restauration "${name}" depuis "${source}"...`);
run(`neon branches create --project-id ${proj} --name ${name} --parent ${source} --no-secrets`);

try {
  const cs = run(`neon connection-string ${name} --project-id ${proj} --pooled`)
    .split(/\r?\n/)
    .filter((l) => l.startsWith("postgres"))
    .pop()
    .trim();
  const sql = neon(cs);

  let tables = -1;
  for (let i = 0; i < 10; i++) {
    try {
      tables = (await sql.query("select count(*)::int n from information_schema.tables where table_schema='public'"))[0].n;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (tables < 0) throw new Error("branche non joignable (timeout)");

  const products = (await sql.query("select count(*)::int n from products"))[0].n;
  const sales = (await sql.query("select count(*)::int n from sales_documents"))[0].n;
  const customers = (await sql.query("select count(*)::int n from customers"))[0].n;

  console.log(`[drill] OK — tables: ${tables} | products: ${products} | sales_documents: ${sales} | customers: ${customers}`);
} finally {
  console.log(`[drill] suppression de la branche "${name}"...`);
  run(`neon branches delete ${name} --project-id ${proj}`);
}
console.log("[drill] terminé.");
