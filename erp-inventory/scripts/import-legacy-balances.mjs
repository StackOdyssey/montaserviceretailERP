// Phase E — Import des soldes d'ouverture legacy dans la DB cible.
//   debt_doc = reste_legacy + Σ chèques en main   → BL VALIDE unpaid (IMPORT)
//   chèques  = customer_payments EN_ATTENTE liés → net solde = reste legacy
// Usage:
//   DATABASE_URL="postgres://..." node scripts/import-legacy-balances.mjs          # dry-run
//   DATABASE_URL="postgres://..." node scripts/import-legacy-balances.mjs --apply  # écrit
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const REF = "C:\\Dev\\ERP_System\\References_";
const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL ?? "");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis"); process.exit(1); }

const norm = (s) => String(s).replace(/\s+/g, " ").trim().toUpperCase();
const toCents = (dh) => Math.round(parseFloat(String(dh).replace(/\s/g, "").replace(",", ".")) * 100);

const debtors = JSON.parse(readFileSync(join(REF, "debtors.json"), "utf8"));
const csv = readFileSync(join(REF, "pending-cheques-review.csv"), "utf8").split("\n").slice(1).filter(Boolean);
const cheques = csv.map((l) => {
  const [client, dateReg, mode, piece, montant, dateDepot, payee, etat] = l.split(";");
  return { client: norm(client), dateReg, mode: /EFFET/i.test(mode) ? "EFFET_LCN" : "CHEQUE", piece: piece.trim(), cents: toCents(montant), dateDepot, payee: payee.trim(), etat: etat.trim() };
});
const restByName = new Map(debtors.map((d) => [norm(d.name), toCents(d.reste)]));
const chequesByClient = new Map();
for (const c of cheques) {
  if (!chequesByClient.has(c.client)) chequesByClient.set(c.client, []);
  chequesByClient.get(c.client).push(c);
}

const customers = await sql`select id, name, phone, city, ice from customers`;
const idByName = new Map(customers.map((c) => [norm(c.name), c]));
const line = (await sql`select id from business_lines where code='PIECES' limit 1`)[0];
const seqRow = (await sql`select * from numbering_sequences where doc_type='BL' and year=extract(year from now())::int and scope_business_line_id is null limit 1`)[0]
  ?? (await sql`select * from numbering_sequences where doc_type='BL' and year=extract(year from now())::int limit 1`)[0];
if (!line || !seqRow) { console.error("business_lines/numbering_sequences manquant", { line, seqRow }); process.exit(1); }

const allNames = new Set([...restByName.keys(), ...chequesByClient.keys()]);
const plan = [], unmatched = [];
for (const name of allNames) {
  const cust = idByName.get(name);
  const reste = restByName.get(name) ?? 0;
  const chqs = chequesByClient.get(name) ?? [];
  const debt = reste + chqs.reduce((s, c) => s + c.cents, 0);
  if (!cust) { unmatched.push({ name, reste, cheques: chqs.length }); continue; }
  if (debt <= 0) continue;
  plan.push({ cust, name, reste, cheques: chqs, debt });
}

const totalDebt = plan.reduce((s, p) => s + p.debt, 0);
const totalChq = plan.reduce((s, p) => s + p.cheques.reduce((x, c) => x + c.cents, 0), 0);
console.log(`Plan: ${plan.length} clients, ${plan.reduce((s,p)=>s+p.cheques.length,0)} chèques, dette totale ${(totalDebt/100).toLocaleString("fr-FR")} DH (reste attendu 697 910,50)`);
console.log(`Non-matched legacy names: ${unmatched.length}`);
unmatched.slice(0, 20).forEach((u) => console.log("  ?", u.name, u.reste / 100, "x" + u.cheques));
if (!APPLY) {
  console.log("\nDRY-RUN — relancer avec --apply pour écrire.");
  console.table(plan.map((p) => ({ client: p.name, debt: p.debt / 100, reste: p.reste / 100, chq: p.cheques.length })));
  process.exit(0);
}

const pad = (n, w) => String(n).padStart(seqRow.width, "0");
let next = seqRow.next_number;
const year = seqRow.year;
for (const p of plan) {
  const docNumber = `${seqRow.prefix}${pad(next, seqRow.width)}`;
  const doc = (await sql`
    insert into sales_documents (doc_type, doc_number, business_line_id, doc_year, sequence_no,
      customer_id, customer_name, customer_phone, customer_city, customer_ice,
      doc_date, status, total_brut_ht_cents, total_net_ht_cents, tva_rate, tva_amount_cents,
      total_ttc_cents, paid_amount_cents, notes)
    values ('BL', ${docNumber}, ${line.id}, ${year}, ${next},
      ${p.cust.id}, ${p.name}, ${p.cust.phone}, ${p.cust.city}, ${p.cust.ice},
      now(), 'VALIDE', ${p.debt}, ${p.debt}, 0, 0,
      ${p.debt}, 0, 'IMPORT LEGACY — solde d''ouverture (reste dû + chèques en main)')
    returning id`)[0];
  for (const c of p.cheques) {
    const [dd, mm, yy] = (c.dateReg || "").split("/");
    const payDate = yy ? `${yy}-${mm}-${dd}` : null;
    const [d2, m2, y2] = (c.dateDepot || "").split("/");
    const dueDate = y2 ? `${y2}-${m2}-${d2}` : null;
    await sql`
      insert into customer_payments (customer_id, document_id, amount_cents, payment_method,
        payment_date, reference_number, cheque_due_date, payee_name, status, notes)
      values (${p.cust.id}, ${doc.id}, ${c.cents}, ${c.mode},
        ${payDate ? `${payDate}T00:00:00` : new Date().toISOString()},
        ${c.piece || null}, ${dueDate ? `${dueDate}T00:00:00` : null},
        ${c.payee || null}, 'EN_ATTENTE', ${'IMPORT LEGACY — ' + c.etat})`;
  }
  next++;
}
await sql`update numbering_sequences set next_number=${next}, updated_at=now() where id=${seqRow.id}`;
console.log(`APPLIED: ${plan.length} docs BL-${year}-* importés, sequence consumée jusqu'à ${next - 1}`);
