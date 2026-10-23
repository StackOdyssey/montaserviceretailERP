import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  toCentimes,
  toDirhams,
  calculateTVAAmount,
  calculateDocumentTotals,
} from "./money";

test("formatMoney formats Dirhams correctly", () => {
  assert.equal(formatMoney(10000), "100,00 DH");
  assert.equal(formatMoney(125050), "1 250,50 DH");
  assert.equal(formatMoney(0), "0,00 DH");
  assert.equal(formatMoney(99), "0,99 DH");
  assert.equal(formatMoney(-5000), "-50,00 DH");
});

test("toCentimes and toDirhams conversions", () => {
  assert.equal(toCentimes(12.5), 1250);
  assert.equal(toDirhams(1250), 12.5);
});

test("Bon de Livraison totals with an explicit 10% TVA rate and custom 5% discount", () => {
  const lines = [
    { unitPriceHT: 5000, quantity: 2 },
    { unitPriceHT: 40000, quantity: 1 },
  ];

  const totals = calculateDocumentTotals(lines, 5, 10);

  assert.equal(totals.totalBrutHT, 50000);
  assert.equal(totals.discountPercent, 5);
  assert.equal(totals.discountAmount, 2500);
  assert.equal(totals.totalNetHT, 47500);
  assert.equal(totals.tvaRate, 10);
  assert.equal(totals.tvaAmount, 4750);
  assert.equal(totals.totalTTC, 52250);

  assert.equal(formatMoney(totals.totalBrutHT), "500,00 DH");
  assert.equal(formatMoney(totals.discountAmount), "25,00 DH");
  assert.equal(formatMoney(totals.totalNetHT), "475,00 DH");
  assert.equal(formatMoney(totals.tvaAmount), "47,50 DH");
  assert.equal(formatMoney(totals.totalTTC), "522,50 DH");
});

test("Default TVA rate is the 20% standard rate", () => {
  const totals = calculateDocumentTotals([{ unitPriceHT: 10000, quantity: 3 }], 0);
  assert.equal(totals.tvaRate, 20);
  assert.equal(totals.tvaAmount, 6000);
  assert.equal(totals.totalTTC, 36000);
  assert.equal(calculateTVAAmount(10000), 2000);
});

test("Non-liable regime (rate 0) yields no TVA", () => {
  const totals = calculateDocumentTotals([{ unitPriceHT: 10000, quantity: 1 }], 10, 0);
  assert.equal(totals.tvaAmount, 0);
  assert.equal(totals.totalTTC, totals.totalNetHT);
});
