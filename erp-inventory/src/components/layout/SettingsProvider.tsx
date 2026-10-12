"use client";

import React, { createContext, useContext } from "react";

export interface CompanySettings {
  raisonSociale: string;
  tradeName: string;
  legalForm: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  ice: string;
  identifiantFiscal: string;
  registreCommerce: string;
  taxeProfessionnelle: string;
  capitalCents: number;
  footerText: string;
  logoUrl: string | null;
  currency: string;
  defaultVatRate: number;
}

export type CompanySettingsInput = { [K in keyof CompanySettings]?: CompanySettings[K] | null };

const DEFAULTS: CompanySettings = {
  raisonSociale: "",
  tradeName: "",
  legalForm: "SARL",
  address: "",
  city: "",
  phone: "",
  email: "",
  ice: "",
  identifiantFiscal: "",
  registreCommerce: "",
  taxeProfessionnelle: "",
  capitalCents: 0,
  footerText: "",
  logoUrl: null,
  currency: "MAD",
  defaultVatRate: 20,
};

const Ctx = createContext<CompanySettings>(DEFAULTS);

export function SettingsProvider({
  settings,
  children,
}: {
  settings?: CompanySettingsInput | null;
  children: React.ReactNode;
}) {
  const s = settings ?? {};
  const value: CompanySettings = {
    raisonSociale: s.raisonSociale ?? DEFAULTS.raisonSociale,
    tradeName: s.tradeName ?? DEFAULTS.tradeName,
    legalForm: s.legalForm ?? DEFAULTS.legalForm,
    address: s.address ?? DEFAULTS.address,
    city: s.city ?? DEFAULTS.city,
    phone: s.phone ?? DEFAULTS.phone,
    email: s.email ?? DEFAULTS.email,
    ice: s.ice ?? DEFAULTS.ice,
    identifiantFiscal: s.identifiantFiscal ?? DEFAULTS.identifiantFiscal,
    registreCommerce: s.registreCommerce ?? DEFAULTS.registreCommerce,
    taxeProfessionnelle: s.taxeProfessionnelle ?? DEFAULTS.taxeProfessionnelle,
    capitalCents: s.capitalCents ?? DEFAULTS.capitalCents,
    footerText: s.footerText ?? DEFAULTS.footerText,
    logoUrl: s.logoUrl ?? DEFAULTS.logoUrl,
    currency: s.currency ?? DEFAULTS.currency,
    defaultVatRate: s.defaultVatRate ?? DEFAULTS.defaultVatRate,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): CompanySettings {
  return useContext(Ctx);
}

export interface Parameters {
  vatRates: Array<{ id: number; label: string; ratePercent: number; isDefault: boolean }>;
  expenseCategories: Array<{ id: number; name: string; vatDeductibleDefault: boolean; receiptRequired: boolean }>;
  paymentMethods: Array<{ code: string; label: string }>;
  priceLevels: Array<{ code: string; label: string }>;
}

const EMPTY_PARAMS: Parameters = {
  vatRates: [],
  expenseCategories: [],
  paymentMethods: [],
  priceLevels: [],
};

const ParamsCtx = createContext<Parameters>(EMPTY_PARAMS);

export function ParametersProvider({
  parameters,
  children,
}: {
  parameters?: Parameters | null;
  children: React.ReactNode;
}) {
  return <ParamsCtx.Provider value={parameters ?? EMPTY_PARAMS}>{children}</ParamsCtx.Provider>;
}

export function useParameters(): Parameters {
  return useContext(ParamsCtx);
}
