// Couche d'export UBL 2.1 isolée (Phase 9 — readiness DGI).
// Objectif : produire un XML structuré à partir d'un document validé, sans jamais
// lier le reste de l'application à un format d'export. Aucune dépendance DGI active.

export interface UblCompany {
  name: string;
  ice?: string | null;
  identifiantFiscal?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  registreCommerce?: string | null;
  taxeProfessionnelle?: string | null;
  capitalCents?: number;
}

export interface UblLine {
  name: string;
  sku: string;
  quantity: number;
  unitPriceHtCents: number;
  totalHtCents: number;
  tvaRate: number;
  tvaAmountCents: number;
  totalTtcCents: number;
}

export interface UblDocument {
  docType: string;
  docNumber: string;
  docDate: string; // ISO
  customerName: string;
  customerIce?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  totalNetHtCents: number;
  tvaAmountCents: number;
  totalTtcCents: number;
  lines: UblLine[];
}

const UBL_INVOICE_TYPES: Record<string, string> = {
  FACTURE: "380", // Commercial invoice
  AVOIR: "381", // Credit note
  BL: "380",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function amount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Construit une facture/avoir UBL 2.1 (chaîne XML). */
export function buildUblInvoice(company: UblCompany, doc: UblDocument): string {
  const typeCode = UBL_INVOICE_TYPES[doc.docType] ?? "380";
  const currency = "MAD";
  const lines = doc.lines
    .map((l, i) => {
      const taxable = amount(l.totalHtCents);
      const lineTva = amount(l.tvaAmountCents);
      return `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${l.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${taxable}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>${esc(l.sku)}</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${currency}">${amount(l.unitPriceHtCents)}</cbc:PriceAmount></cac:Price>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${lineTva}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${taxable}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${lineTva}</cbc:TaxAmount>
        <cac:TaxCategory><cbc:ID>${l.tvaRate}</cbc:ID></cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${esc(doc.docNumber)}</cbc:ID>
  <cbc:IssueDate>${new Date(doc.docDate).toISOString().slice(0, 10)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(company.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(company.address ?? "")}</cbc:StreetName>
        <cbc:CityName>${esc(company.city ?? "")}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(company.ice ?? "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>ICE</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(doc.customerName)}</cbc:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(doc.customerAddress ?? "")}</cbc:StreetName>
        <cbc:CityName>${esc(doc.customerCity ?? "")}</cbc:CityName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(doc.customerIce ?? "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>ICE</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${amount(doc.tvaAmountCents)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${amount(doc.totalNetHtCents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${amount(doc.totalNetHtCents)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${amount(doc.totalTtcCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${amount(doc.totalTtcCents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}
