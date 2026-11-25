// ============================================================================
// Legacy Bestway_BMM (MySQL 5.6 @ 127.0.0.1:3307) → Neon (Drizzle schema) import
// ----------------------------------------------------------------------------
// Usage:
//   node scripts/migration/import-legacy.mjs --dry-run            # transform + report only
//   node scripts/migration/import-legacy.mjs --apply [--wipe]     # write to MIGRATION_DATABASE_URL
//
// Rules (agreed):
//  - Legacy stores HT = TTC/1.2 → all prices × (1+taxe/100) → cents.
//  - stock.qte is the truth (produit.qte disagrees on 457 rows).
//  - Doc totals: legacy montant_mvt is truth; line rounding diff absorbed
//    into the largest line.
//  - Credit legs (mode CREDIT etat 0/4) carry a running balance:
//    montant_credit = doc outstanding after that leg.
//  - Payment legs (etat 1/3) dated after the doc date = règlements
//    (customer_payments); same-day legs = tenders (sales_tenders).
//  - achat.num_piece repurposed as amount when total is NULL/0.
//  - etat=0 mouvement → ANNULE ; etat=5 → AVOIR/RETOUR.
//  - client.type: 1→SEMI_GROS, 2→GROS, 0/NULL/3→catalog.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(path.join(__dirname, '../../.env.local'), 'utf8');
const TARGET_URL =
  process.env.MIGRATION_DATABASE_URL ||
  envFile.match(/DATABASE_URL="([^"]+)"/)[1];

const DRY = !process.argv.includes('--apply');
const WIPE = process.argv.includes('--wipe');
const sql = neon(TARGET_URL);

const C = (v) => Math.round(Number(v ?? 0) * 100);          // DH → cents
const TTC = (ht, taxe) => Math.round(Number(ht ?? 0) * (1 + Number(taxe ?? 20) / 100) * 100);
const I = (v) => Math.round(Number(v ?? 0));
const NORM_DATE = (d) => {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const s = String(d);
  if (s.startsWith('0000') || s === 'Invalid Date') return null;
  const t = new Date(s);
  return isNaN(t.getTime()) ? null : t;
};

const report = { anomalies: [], phases: [] };
const warn = (msg) => report.anomalies.push(msg);

// ---------------------------------------------------------------------------
async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 3307, user: 'root', database: 'Bestway_BMM',
    password: process.env.LEGACY_MYSQL_PASSWORD ?? '',
    charset: 'utf8mb4',
  });

  // ---- source pull ---------------------------------------------------------
  const [categories] = await conn.query('SELECT * FROM categorie');
  const [marques] = await conn.query('SELECT * FROM marque');
  const [clients] = await conn.query('SELECT * FROM client');
  const [employes] = await conn.query('SELECT * FROM employe');
  const [produits] = await conn.query('SELECT * FROM produit');
  const [stocks] = await conn.query('SELECT * FROM stock');
  const [mvts] = await conn.query('SELECT * FROM mouvement ORDER BY id');
  const [lignes] = await conn.query('SELECT * FROM mouvement_ligne');
  const [pays] = await conn.query('SELECT * FROM paiement ORDER BY id');
  const [achats] = await conn.query('SELECT * FROM achat');
  const [config] = await conn.query('SELECT * FROM configuration LIMIT 1');
  await conn.end();

  const stockByProd = Object.fromEntries(stocks.map((s) => [s.produit_id, s]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const marqueById = Object.fromEntries(marques.map((m) => [m.id, m]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const prodById = Object.fromEntries(produits.map((p) => [p.id, p]));

  // ---- target lookups ------------------------------------------------------
  const bl = await sql`SELECT id, code FROM business_lines ORDER BY id`;
  const LINE_PIECES = bl.find((b) => b.code === 'PIECES')?.id ?? bl[0].id;
  const LINE_VEH = bl.find((b) => b.code === 'VEHICULES')?.id;
  const levels = await sql`SELECT id, code FROM price_levels WHERE business_line_id = ${LINE_PIECES}`;
  const LVL_GROS = levels.find((l) => l.code === 'GROS')?.id;
  const LVL_SEMI = levels.find((l) => l.code === 'SEMI_GROS')?.id;
  const wh = await sql`SELECT id FROM warehouses WHERE is_default LIMIT 1`;
  const WH_ID = wh[0].id;
  const vr = await sql`SELECT id FROM vat_rates WHERE rate_percent = 0 LIMIT 1`;
  const VAT0 = vr[0]?.id ?? null;
  const ec = await sql`SELECT id FROM expense_categories WHERE name = 'Autres' LIMIT 1`;
  const EXP_CAT = ec[0]?.id ?? null;

  if (WIPE && !DRY) {
    await sql`CREATE TABLE IF NOT EXISTS legacy_map (entity_type text, legacy_id text, new_id int, meta jsonb, PRIMARY KEY(entity_type, legacy_id))`;
    await sql`TRUNCATE sales_tenders, customer_payments, document_links, sales_lines,
      stock_movements, product_stock, product_prices, customer_product_prices,
      parked_carts, expenses, cashier_days, sales_documents, stock_transfers, stock_transfer_lines,
      stock_count_lines, stock_counts, supplier_receipt_lines, supplier_receipts, supplier_payments,
      supplier_emails, products, product_references, customers, suppliers, brands,
      categories, staff RESTART IDENTITY CASCADE`;
    report.phases.push('wipe: business data truncated');
  } else {
    await sql`CREATE TABLE IF NOT EXISTS legacy_map (entity_type text, legacy_id text, new_id int, meta jsonb, PRIMARY KEY(entity_type, legacy_id))`;
  }

  const ins = async (queryText, params) => (DRY ? null : sql.query(queryText, params));
  const mapId = async (type, legacyId, newId, meta) =>
    !DRY && sql`INSERT INTO legacy_map VALUES (${type}, ${String(legacyId)}, ${newId}, ${JSON.stringify(meta ?? {})}) ON CONFLICT DO NOTHING`;
  const maps = {};

  // ---- 1. taxonomy ---------------------------------------------------------
  const catMap = {};
  for (const c of categories) {
    const r = await ins(
      `INSERT INTO categories (name, description, created_at) VALUES ($1,$2,$3) RETURNING id`,
      [c.libelle, `legacy categorie #${c.id}`, NORM_DATE(c.date_add)]
    );
    catMap[c.id] = r ? r[0].id : null;
    if (!DRY) await mapId('category', c.id, r[0].id);
  }
  const brandMap = {};
  for (const m of marques) {
    const r = await ins(`INSERT INTO brands (name, created_at) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING id`, [m.libelle, NORM_DATE(m.date_add)]);
    const id = r?.[0]?.id ?? (await sql`SELECT id FROM brands WHERE name=${m.libelle}`)[0]?.id;
    brandMap[m.id] = id;
    if (!DRY) await mapId('brand', m.id, id);
  }
  report.phases.push(`taxonomy: ${categories.length} categories, ${marques.length} brands`);

  // ---- 2. staff (employe → staff, role COMMERCIAL) ---------------------------
  const staffMap = {};
  for (const e of employes) {
    const name = [e.nom, e.prenom].filter(Boolean).join(' ').trim() || e.login || `Employe ${e.id}`;
    const r = await ins(`INSERT INTO staff (name, role, created_at) VALUES ($1,'COMMERCIAL',$2) RETURNING id`, [name, NORM_DATE(e.date_add)]);
    staffMap[e.id] = r ? { id: r[0].id, name } : null;
    if (!DRY) await mapId('staff', e.id, r[0].id, { login: e.login, profile: e.profile });
  }
  report.phases.push(`staff: ${employes.length} employes`);

  // ---- 3. customers --------------------------------------------------------
  const custMap = {};
  for (const c of clients) {
    const name = (c.raisonsociale || c.appellation || `Client ${c.id}`).trim();
    const levelId = c.type === 1 ? LVL_SEMI : c.type === 2 ? LVL_GROS : null;
    const r = await ins(
      `INSERT INTO customers (name, phone, email, city, address, ice, identity_number,
        is_wholesale, is_professional, default_price_level_id, credit_limit_cents,
        payment_terms, payment_term_days, representative, external_ref, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        name, c.tel || c.gsm || null, c.email || null, c.ville || null, c.adresse || null,
        c.cod_ice || null, c.cin || null,
        c.type === 2, !!c.cod_ice, levelId,
        c.plafond_credit > 0 ? C(c.plafond_credit) : null,
        c.type_paiement || null, c.echeance || null, c.representant || null,
        `L-${c.id}`, c.commentaire_blocage || null, NORM_DATE(c.date_add),
      ]
    );
    custMap[c.id] = r ? { id: r[0].id, name } : null;
    if (!DRY) await mapId('customer', c.id, r[0].id, { type: c.type });
  }
  report.phases.push(`customers: ${clients.length}`);

  // ---- 4. products + tiers + stock -----------------------------------------
  const prodMap = {};
  let photosMissing = 0;
  for (const p of produits) {
    const st = stockByProd[p.id];
    const qty = I(st?.qte);
    if (st && st.qte != Math.floor(st.qte)) warn(`product ${p.reference}: fractional stock ${st.qte}`);
    const saleTtc = TTC(p.prix_vente_ht, p.taxe);
    const costTtc = TTC(p.prix_achat_ht, p.taxe);
    const lineId = p.categorie_id === 1 && LINE_VEH ? LINE_VEH : LINE_PIECES;
    const brandName = marqueById[p.marque_id]?.libelle ?? null;
    const r = await ins(
      `INSERT INTO products (sku, barcode, name, brand, oem_code, business_line_id,
        category_id, warehouse_id, vat_rate_id, tva_rate, cost_price_ht_cents,
        last_purchase_price_cents, cmup_cents, sale_price_ht_cents, min_stock_alert,
        current_stock, unit, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15,$16,true,$17) RETURNING id`,
      [
        String(p.reference), p.codebarre || null, p.designation?.trim() || `Produit ${p.reference}`,
        brandName, p.code_suppl1 || null, lineId, catMap[p.categorie_id] ?? null,
        WH_ID, VAT0, costTtc, costTtc, costTtc, saleTtc,
        I(p.st_minimum) || 0, qty, p.unite || 'PIECE', NORM_DATE(p.date_add),
      ]
    );
    const pid = r ? r[0].id : null;
    prodMap[p.id] = pid;
    if (!DRY) {
      await mapId('product', p.id, pid, { photo: p.photo, etat: p.etat });
      if (pid) {
        await sql`INSERT INTO product_stock (product_id, warehouse_id, quantity) VALUES (${pid},${WH_ID},${qty}) ON CONFLICT DO NOTHING`;
        if (qty !== 0)
          await sql`INSERT INTO stock_movements (product_id, business_line_id, movement_type, quantity, unit_cost_cents, warehouse_id, reason, created_at)
            VALUES (${pid},${lineId},'STOCK_INITIAL',${qty},${costTtc},${WH_ID},'Import legacy Bestway_BMM',${NORM_DATE(p.date_add)})`;
        if (LVL_GROS && p.prix_grossiste_ht > 0)
          await sql`INSERT INTO product_prices (product_id, price_level_id, price_ht_cents, created_at) VALUES (${pid},${LVL_GROS},${TTC(p.prix_grossiste_ht, p.taxe)},${NORM_DATE(p.date_add)}) ON CONFLICT DO NOTHING`;
        if (LVL_SEMI && p.prix_demi_grossiste_ht > 0)
          await sql`INSERT INTO product_prices (product_id, price_level_id, price_ht_cents, created_at) VALUES (${pid},${LVL_SEMI},${TTC(p.prix_demi_grossiste_ht, p.taxe)},${NORM_DATE(p.date_add)}) ON CONFLICT DO NOTHING`;
      }
    }
  }
  report.phases.push(`products: ${produits.length}`);

  // ---- 5. documents --------------------------------------------------------
  const lignesByMvt = {};
  for (const l of lignes) (lignesByMvt[l.mouvement_id] ??= []).push(l);
  const legsByMvt = {};
  for (const p of pays) (legsByMvt[p.mvt_id] ??= []).push(p);

  const PAY_METHODS = {
    ESPECE: 'ESPECES', 'CARTE BANCAIRE': 'CARTE_BANCAIRE', CHEQUE: 'CHEQUE',
    VIREMENT: 'VIREMENT', FACTURATION: 'VIREMENT', EFFET: 'EFFET_LCN',
    AVOIR: 'AVOIR', ACOMPTE: 'VERSEMENT',
  };
  const docMap = {};
  let linesTotal = 0, docsImported = 0, payRows = 0, tenders = 0, skippedLines = 0;

  for (const m of mvts) {
    const cancelled = m.etat === 0;
    const isReturn = m.etat === 5;
    const cust = custMap[m.client_id];
    const lns = lignesByMvt[m.mvt_id] ?? [];
    const legs = legsByMvt[m.mvt_id] ?? [];
    const docDate = NORM_DATE(m.date_bl) || NORM_DATE(m.date_add) || m.date_creation || null;
    const year = docDate ? new Date(docDate).getFullYear() : new Date().getFullYear();
    const seq = parseInt(String(m.ref_bl).replace(/\D/g, ''), 10) || m.mvt_id;
    const totalCents = C(m.montant_mvt);
    const emp = staffMap[m.employe_comsecteurid];

    // payment legs: mode-specific active etats (1=ESPECE, 2=CB, 3=CHEQUE,
    // 5/17=VIREMENT, 30=FACTURATION). etat=0 = leg annulled. CREDIT (4/0),
    // REMISE (8), RENDU (11), REPORT A NOUVEAU (20), dépense shadow (35)
    // are handled elsewhere or skipped.
    const payLegs = legs.filter((p) => [1, 2, 3, 5, 17, 30].includes(p.etat));
    const creditLegs = legs.filter((p) => p.mode_paiement === 'CREDIT' && [0, 4].includes(p.etat));
    // REMISE GLOBAL (etat=8): post-total discount. Sometimes real (legs pay
    // mvt-remise), sometimes a memo (legs pay full mvt) — only the gap between
    // montant_mvt and recorded legs counts as an effective discount.
    // REMISE LIGNE legs are pure shadows of ligne.remise_fixe → skipped.
    const remiseG = legs
      .filter((p) => p.etat === 8 && p.mode_paiement === 'REMISE GLOBAL')
      .reduce((s, p) => s + C(p.montant), 0);
    const settledCents = payLegs.reduce((s, p) => s + C(p.montant), 0)
      + creditLegs.reduce((s, p) => s + C(p.montant), 0);
    const remiseEff = Math.min(remiseG, Math.max(0, totalCents - settledCents));
    const netCents = totalCents - remiseEff;
    const paidCents = Math.min(netCents, payLegs.reduce((s, p) => s + C(p.montant), 0));
    const status = cancelled ? 'ANNULE' : paidCents >= netCents && netCents > 0 ? 'PAYE' : 'VALIDE';

    const r = await ins(
      `INSERT INTO sales_documents (doc_type, doc_number, business_line_id, doc_year, sequence_no,
        customer_id, customer_name, customer_phone, customer_city, doc_date, status,
        total_brut_ht_cents, discount_amount_cents, total_net_ht_cents, tva_rate,
        tva_amount_cents, total_ttc_cents, paid_amount_cents, payment_method,
        notes, commercial_id, commercial_name, vat_display, price_basis,
        validated_at, cancelled_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,0,$15,$16,$17,$18,$19,$20,'HIDDEN','TTC',$21,$22,$23) RETURNING id`,
      [
        isReturn ? 'AVOIR' : 'BL', m.ref_bl, LINE_PIECES, year, seq,
        cust?.id ?? null, cust?.name ?? m.appellation ?? 'Client inconnu',
        clientById[m.client_id]?.tel ?? null, clientById[m.client_id]?.ville ?? null,
        docDate, status,
        totalCents, remiseEff, Math.max(0, netCents),
        netCents, paidCents,
        payLegs[0] ? PAY_METHODS[payLegs[0].mode_paiement] ?? 'ESPECES' : null,
        cancelled ? `Legacy etat=${m.etat} (annulé)` : null,
        emp?.id ?? null, emp?.name ?? null,
        cancelled ? null : docDate, cancelled ? docDate : null, docDate,
      ]
    );
    const docId = r ? r[0].id : null;
    docMap[m.mvt_id] = docId;
    if (!DRY) await mapId('doc', m.mvt_id, docId, { ref: m.ref_bl, etat: m.etat });
    docsImported++;

    // ---- lines (etat=0 = ligne retirée du ticket → skip) ----
    let sum = 0;
    const activeLns = lns.filter((l) => l.etat !== 0);
    skippedLines += lns.length - activeLns.length;
    const rows = activeLns.map((l) => {
      const unit = TTC(l.prix_fixe, l.taxe);
      const qty = I(l.qte_bl);
      const tot = qty * unit;
      sum += tot;
      return { l, unit, qty, tot };
    });
    // absorb rounding diff into the largest line (doc total is truth)
    if (rows.length && !cancelled && !isReturn) {
      const diff = totalCents - sum;
      if (diff !== 0) {
        const big = rows.reduce((a, b) => (b.tot > a.tot ? b : a));
        big.tot += diff;
        if (Math.abs(diff) > 200) warn(`${m.ref_bl}: line-sum adjustment ${diff / 100} DH`);
      }
    }
    for (const { l, unit, qty, tot } of rows) {
      linesTotal++;
      if (DRY) continue;
      const prod = prodById[l.produit_id];
      await sql`INSERT INTO sales_lines (document_id, product_id, product_name_snapshot,
        sku_snapshot, unit_price_ht_cents, quantity, total_ht_cents, discount_percent,
        discount_amount_cents, unit_cost_cents, tva_rate, total_ttc_cents,
        unit_price_ttc_cents, price_forced, is_free)
        VALUES (${docId},${prodMap[l.produit_id] ?? null},${l.designation ?? prod?.designation ?? ''},
        ${String(prod?.reference ?? l.produit_id)},${unit},${qty},${tot},0,
        ${l.remise_fixe > 0 ? TTC(l.remise_fixe, l.taxe) : 0},${TTC(l.prix_achat_ht, l.taxe)},0,
        ${tot},${unit},${l.prix_forcer > 0 ? 1 : 0},${tot === 0 && qty > 0})`;
    }

    // ---- payment legs → sales_tenders (journal caisse, at-sale only) +
    //      customer_payments (client ledger — EVERY leg, like the app's own
    //      sale flow which writes a "Règlement à la vente" row per tender) ----
    for (const p of payLegs) {
      const method = PAY_METHODS[p.mode_paiement] ?? 'ESPECES';
      const atSale = String(p.date_add).slice(0, 10) === String(docDate).slice(0, 10);
      if (DRY) continue;
      if (atSale) {
        await sql`INSERT INTO sales_tenders (document_id, method, amount_cents, reference_number, created_at)
          VALUES (${docId},${method},${C(p.montant)},${p.numero || null},${NORM_DATE(p.date_add) || docDate})`;
        tenders++;
      }
      if (cust) {
        await sql`INSERT INTO customer_payments (customer_id, document_id, amount_cents, payment_method,
          payment_date, reference_number, cheque_due_date, status, notes, created_at)
          VALUES (${cust.id},${docId},${C(p.montant)},${method},${NORM_DATE(p.date_add) || docDate},
          ${p.numero || null},${NORM_DATE(p.date_echeance)},'ENCAISSE',
          ${atSale ? 'Règlement à la vente ' + m.ref_bl : 'Règlement legacy ' + p.mode_paiement},${NORM_DATE(p.date_add) || docDate})`;
        payRows++;
      }
    }
    // credit leg marked settled (mc=0) but no valid payment leg exists —
    // legacy hides it from the debt list; we keep it owed and flag it.
    if (!cancelled && creditLegs.length && creditLegs.every((p) => C(p.montant_credit) <= 0)
        && !payLegs.length && !remiseG && totalCents > 0) {
      warn(`${m.ref_bl}: credit leg mc=0 but no valid payment legs — kept as owed (${totalCents / 100} DH), legacy hides it`);
    }
    // doc with paiement=3 but no legs → treat as paid in cash (1 known case)
    if (!payLegs.length && !creditLegs.length && m.paiement === 3 && totalCents > 0 && !cancelled) {
      if (!DRY) {
        await sql`UPDATE sales_documents SET paid_amount_cents=${netCents}, status='PAYE', payment_method='ESPECES' WHERE id=${docId}`;
        await sql`INSERT INTO sales_tenders (document_id, method, amount_cents) VALUES (${docId},'ESPECES',${netCents})`;
      }
      warn(`${m.ref_bl}: no payment legs, marked paid per m.paiement=3`);
    }
  }
  report.phases.push(`docs: ${docsImported} mouvements, ${linesTotal} lines (${skippedLines} etat=0 skipped), ${tenders} tenders, ${payRows} règlements`);

  // ---- orphan lines (mouvement_id with no header) — preserve, don't drop ----
  const orphanLines = lignes.filter((l) => !(l.mouvement_id in docMap));
  for (const l of orphanLines) {
    warn(`orphan line #${l.id} (mouvement_id=${l.mouvement_id}, produit=${l.produit_id}, ${l.designation}) — no header, preserved in legacy_map`);
    if (!DRY)
      await mapId('orphan_line', l.id, null, {
        mouvement_id: l.mouvement_id, produit_id: l.produit_id,
        designation: l.designation, qte_bl: l.qte_bl, prix_fixe: l.prix_fixe, etat: l.etat,
      });
  }

  // ---- 6. expenses (achat) --------------------------------------------------
  let expCount = 0;
  for (const a of achats) {
    const amount = a.total > 0 ? C(a.total) : /^\d+(\.\d+)?$/.test(String(a.num_piece ?? '')) ? C(a.num_piece) : 0;
    const title = [a.fournisseur, a.libelle].filter(Boolean).join(' — ') || a.titre || 'Dépense';
    if (!DRY)
      await sql`INSERT INTO expenses (title, category, category_id, amount_cents, amount_ht_cents,
        tva_rate, tva_amount_cents, expense_date, notes, created_at)
        VALUES (${title.slice(0, 200)},'AUTRE',${EXP_CAT},${amount},${amount},0,0,
        ${NORM_DATE(a.date_dep) || NORM_DATE(a.date_add)},${`legacy achat #${a.id} · ${a.mode_paiement ?? ''} · ${a.compte ?? ''}`},
        ${NORM_DATE(a.date_add)})`;
    expCount++;
  }
  report.phases.push(`expenses: ${expCount}`);

  // ---- 7. sequences ---------------------------------------------------------
  const cfg = config[0];
  // legacy POS tickets use the id_tik counter (BL_ prefix); id_bl is the
  // unused wholesale BL counter (stuck at 100).
  const nextBl = Number(cfg.id_tik); // 944
  if (!DRY) {
    await sql`INSERT INTO numbering_sequences (doc_type, year, scope_business_line_id, prefix, width, next_number)
      VALUES ('BL',2026,${LINE_PIECES},'BL-',5,${nextBl})
      ON CONFLICT (doc_type, year, scope_business_line_id) DO UPDATE SET next_number=GREATEST(${nextBl}, numbering_sequences.next_number)`;
    const y27 = await sql`SELECT id FROM numbering_sequences WHERE doc_type='BL' AND year=2027 LIMIT 1`;
    if (y27[0]) await sql`UPDATE numbering_sequences SET next_number=${nextBl} WHERE id=${y27[0].id}`;
  }
  report.phases.push(`sequences: BL next = ${nextBl} (legacy id_tik=${cfg.id_tik})`);

  // ---- reconcile ------------------------------------------------------------
  const legacyDocs = mvts.filter((m) => m.etat !== 0);
  const legacySum = legacyDocs.reduce((s, m) => s + C(m.montant_mvt), 0);
  // Legacy debt as its own règlement UI computes it: doc appears iff a CREDIT
  // leg still has montant_credit>0 (etat=4, type_paiement=0, paiement<=2,
  // client != comptoir), reste = Σlegs(etat∉0,8,10,11 & type=0) − Σlegs(etat∉0,4,8,10,11 & type!=10).
  const legacyOwedByClient = {};
  for (const m of mvts) {
    if (String(m.client_id) === '2001099') continue;
    const legs = legsByMvt[m.mvt_id] ?? [];
    const listed = legs.some((p) => p.etat === 4 && p.montant_credit > 0 && p.type_paiement == 0 && p.paiement <= 2);
    if (!listed) continue;
    const tmvt = legs.filter((p) => ![0, 8, 10, 11].includes(p.etat) && p.type_paiement == 0).reduce((s, p) => s + C(p.montant), 0);
    const tpay = legs.filter((p) => ![0, 4, 8, 10, 11].includes(p.etat) && p.type_paiement != 10).reduce((s, p) => s + C(p.montant), 0);
    const owed = tmvt - tpay;
    if (owed > 50) legacyOwedByClient[m.client_id] = (legacyOwedByClient[m.client_id] ?? 0) + owed;
  }
  report.reconcile = {
    legacy: {
      produits: produits.length, clients: clients.length, docs: mvts.length,
      docsNet: legacyDocs.length, lines: lignes.length,
      sumMontant: legacySum / 100 + ' DH',
      openCredit: Object.values(legacyOwedByClient).reduce((a, b) => a + b, 0) / 100 + ' DH',
    },
  };
  if (!DRY) {
    const [cnt] = await sql`SELECT (SELECT count(*) FROM products) p, (SELECT count(*) FROM customers) c,
      (SELECT count(*) FROM sales_documents) d, (SELECT count(*) FROM sales_lines) l,
      (SELECT count(*) FROM sales_tenders) t, (SELECT count(*) FROM customer_payments) cp,
      (SELECT count(*) FROM expenses) e, (SELECT sum(total_ttc_cents) FROM sales_documents WHERE status!='ANNULE') sttc`;
    const owed = await sql`SELECT customer_id, sum(total_ttc_cents - paid_amount_cents) owed
      FROM sales_documents WHERE status='VALIDE' AND total_ttc_cents > paid_amount_cents GROUP BY customer_id`;
    report.reconcile.target = {
      products: +cnt.p, customers: +cnt.c, docs: +cnt.d, lines: +cnt.l,
      tenders: +cnt.t, payments: +cnt.cp, expenses: +cnt.e,
      sumTtc: (Number(cnt.sttc) / 100).toFixed(2) + ' DH',
      openCredit: (owed.reduce((s, r) => s + Number(r.owed), 0) / 100).toFixed(2) + ' DH',
      perClient: owed.length,
    };
    const map = Object.fromEntries((await sql`SELECT id, external_ref FROM customers WHERE external_ref LIKE 'L-%'`).map((r) => [r.id, r.external_ref.slice(2)]));
    report.reconcile.creditCheck = owed.map((r) => {
      const lid = map[r.customer_id];
      const legacyOwed = (legacyOwedByClient[lid] ?? 0) / 100;
      const ours = Number(r.owed) / 100;
      return Math.abs(legacyOwed - ours) > 1 ? `client ${lid}: legacy ${legacyOwed} vs ours ${ours}` : null;
    }).filter(Boolean);
    await sql`INSERT INTO audit_logs (action, entity_type, details) VALUES ('IMPORT_LEGACY','migration',${JSON.stringify(report.reconcile)})`;
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
