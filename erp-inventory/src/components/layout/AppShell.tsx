"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Users,
  Truck,
  Receipt,
  FileText,
  BarChart3,
  ScrollText,
  Settings,
  Mail,
  LogOut,
  Lock,
  Package,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  PlusCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VAT_NOT_LIABLE_MENTION } from "@/lib/vat-regime";
import { logout } from "@/lib/actions/auth";
import { clearAppCaches } from "@/components/pwa/clear-app-caches";
import {
  BusinessLineProvider,
  BusinessLineSelect,
  type BusinessLine,
} from "@/components/layout/BusinessLineProvider";
import {
  SettingsProvider,
  ParametersProvider,
  type CompanySettingsInput,
  type Parameters,
} from "@/components/layout/SettingsProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { LockScreen } from "@/components/layout/LockScreen";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
}

const navItems: NavItem[] = [
  {
    label: "Tableau de bord",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Ventes & BL",
    href: "/ventes",
    icon: ShoppingCart,
    badge: "POS",
    badgeColor: "bg-[#F7162D] text-white",
  },
  {
    label: "Catalogue & Stock",
    href: "/stock",
    icon: Boxes,
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    label: "Règlements Clients",
    href: "/reglements",
    icon: Receipt,
  },
  {
    label: "Fournisseurs",
    href: "/fournisseurs",
    icon: Truck,
  },
  {
    label: "Livraisons",
    href: "/livraisons",
    icon: Package,
  },
  {
    label: "Courriels Fournisseurs",
    href: "/courriel",
    icon: Mail,
    badge: "2",
    badgeColor: "bg-blue-600 text-white",
  },
  {
    label: "Dépenses Caisse",
    href: "/depenses",
    icon: FileText,
  },
  {
    label: "Rapports & TVA",
    href: "/comptabilite",
    icon: BarChart3,
  },
  {
    label: "Journal Opérations",
    href: "/operations-log",
    icon: ScrollText,
  },
  {
    label: "Paramètres Société",
    href: "/parametres",
    icon: Settings,
  },
];


export function AppShell({ children, lines, settings, parameters }: { children: React.ReactNode; lines: BusinessLine[]; settings?: CompanySettingsInput | null; parameters?: Parameters | null }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Mémoriser l'état plié/déplié de la sidebar
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem("bm_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Sur la page de connexion, afficher l'écran plein écran sans la barre de navigation.
  // Le return est APRÈS les hooks : AppShell reste monté lors des navigations
  // (/login -> /), un return anticipé changerait le nombre de hooks appelés.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Libellés TVA dérivés des paramètres (régime global + taux par défaut), jamais codés en dur.
  const vatLiable = settings?.vatLiable ?? true;
  const vatRate = settings?.defaultVatRate ?? 20;
  const vatLabel = vatLiable ? `TVA ${vatRate}%` : VAT_NOT_LIABLE_MENTION;
  const vatShort = vatLiable ? `${vatRate}%` : "HT";

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("bm_sidebar_collapsed", String(nextState));
  };

  return (
    <SettingsProvider settings={settings}>
    <ParametersProvider parameters={parameters}>
    <BusinessLineProvider lines={lines}>
    <ToastProvider>
    <div className="min-h-screen bg-[#F8F9FA] text-[#111827] flex flex-col md:flex-row">
      {/* ======================================================== */}
      {/* 1. SIDEBAR DESKTOP PLIABLE VERS LA GAUCHE                */}
      {/* ======================================================== */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-white border-r border-[#E5E7EB] transition-all duration-300 ease-in-out sticky top-0 h-screen z-30 shadow-sm",
          isCollapsed ? "w-[76px]" : "w-[260px]"
        )}
      >
        {/* En-tête Sidebar avec Logo BM Motors */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#E5E7EB]">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
              <Image
                src="/icon-192.png"
                alt="Logo BM Motors"
                width={36}
                height={36}
                className="rounded-lg"
                priority
              />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-[#111827] leading-none">
                  BM MOTORS
                </span>
                <span className="text-[11px] font-medium text-[#F7162D] mt-0.5">
                  ERP Pièces SARL
                </span>
              </div>
            )}
          </Link>

          {/* Bouton pour plier/déplier la sidebar */}
          <button
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Déplier le menu" : "Replier le menu"}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Bouton Action Rapide : Nouveau BL */}
        <div className="p-3">
          <Link
            href="/ventes/nouveau"
            className={cn(
              "flex items-center justify-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-medium rounded-xl transition-all shadow-sm active:scale-98",
              isCollapsed ? "h-11 w-11 mx-auto p-0" : "h-11 w-full px-4"
            )}
            title="Créer un nouveau Bon de Livraison"
          >
            <PlusCircle size={20} className="shrink-0" />
            {!isCollapsed && <span className="text-sm font-semibold">Nouveau BL</span>}
          </Link>
        </div>

        {/* Navigation Principale */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all group",
                  isActive
                    ? "bg-[#FEF2F2] text-[#F7162D] font-semibold"
                    : "text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827]"
                )}
              >
                <Icon
                  size={20}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[#F7162D]" : "text-[#6B7280] group-hover:text-[#111827]"
                  )}
                />
                {!isCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md",
                          item.badgeColor || "bg-[#E5E7EB] text-[#374151]"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Pied de Sidebar */}
        <div className="p-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">
          {!isCollapsed ? (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[#111827]">BM Motors SARL</span>
              <span>{vatLabel} • {settings?.currency ?? "MAD"}</span>
            </div>
          ) : (
            <div className="text-center font-bold text-[#F7162D]">{vatShort}</div>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => setIsLocked(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold text-gray-500 hover:text-[#111827] hover:bg-gray-100 rounded-lg transition"
              title="Verrouiller l'écran (le code PIN déverrouille)"
            >
              <Lock size={14} />
              {!isCollapsed && <span>Verrouiller</span>}
            </button>
            <button
              onClick={async () => {
                await logout();
                await clearAppCaches();
                window.location.href = "/login";
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold text-gray-500 hover:text-[#F7162D] hover:bg-red-50 rounded-lg transition"
              title="Se déconnecter"
            >
              <LogOut size={14} />
              {!isCollapsed && <span>Déconnexion</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. EN-TÊTE MOBILE & DRAWER SLIDE-OVER                    */}
      {/* ======================================================== */}
      <div className="md:hidden flex items-center justify-between h-14 px-4 bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Ouvrir le menu"
            className="p-1.5 -ml-1 text-[#374151] hover:bg-[#F3F4F6] rounded-lg"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Image
              src="/icon-192.png"
              alt="Logo BM Motors"
              width={30}
              height={30}
              className="rounded-md"
            />
            <span className="font-bold text-sm tracking-tight text-[#111827]">BM MOTORS</span>
          </div>
        </div>

        <Link
          href="/ventes/nouveau"
          className="flex items-center gap-1.5 bg-[#F7162D] text-white text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95"
        >
          <PlusCircle size={15} />
          <span>BL</span>
        </Link>
      </div>

      {/* Menu mobile coulissant (Drawer) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Tiroir */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <div className="h-16 flex items-center justify-between px-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <Image
                  src="/icon-192.png"
                  alt="Logo BM Motors"
                  width={30}
                  height={30}
                  className="rounded-md"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[#111827]">BM MOTORS</span>
                  <span className="text-[11px] text-[#F7162D] font-medium">SARL • Pièces Moto</span>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-[#6B7280] hover:text-[#111827] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center justify-between px-3 py-3 rounded-xl font-medium text-sm transition-all",
                      isActive
                        ? "bg-[#FEF2F2] text-[#F7162D] font-bold"
                        : "text-[#374151] hover:bg-[#F3F4F6]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        size={20}
                        className={isActive ? "text-[#F7162D]" : "text-[#6B7280]"}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-[#F7162D] text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-[#E5E7EB] bg-[#F8F9FA] text-xs text-[#6B7280]">
              <p className="font-semibold text-[#111827]">BM Motors ERP v2.0</p>
              <p>{vatLabel} • {settings?.currency ?? "MAD"}</p>
              <button
                onClick={() => { setIsMobileMenuOpen(false); setIsLocked(true); }}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-[#111827] bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition"
              >
                <Lock size={14} />
                <span>Verrouiller</span>
              </button>
              <button
                onClick={async () => {
                  await logout();
                  await clearAppCaches();
                  window.location.href = "/login";
                }}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-white bg-[#F7162D] hover:bg-[#d81023] rounded-xl shadow-xs transition"
              >
                <LogOut size={14} />
                <span>Déconnexion Gérant</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. ZONE DE CONTENU PRINCIPALE                            */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Barre supérieure Desktop */}
        <header className="hidden md:flex h-16 bg-white border-b border-[#E5E7EB] items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 w-96">
            <div className="relative w-full">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              />
              <input
                type="text"
                placeholder="Recherche rapide (Réf, OEM, Désignation, Client)..."
                className="w-full pl-9 pr-4 py-1.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F7162D]/20 focus:border-[#F7162D] transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <BusinessLineSelect />
            <Link href="/profil" className="flex items-center gap-4 hover:opacity-80 transition-opacity" title="Mon profil">
              <div className="text-right">
                <span className="text-xs font-semibold text-[#111827] block">SARL BM Motors</span>
                <span className="text-[11px] text-[#059669] font-medium flex items-center justify-end gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                  Connecté
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center text-[#F7162D] font-bold text-xs">
                BM
              </div>
            </Link>
          </div>
        </header>

        {/* Contenu de la page */}
        <main className="flex-1 p-2 md:p-2 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* ======================================================== */}
      {/* 4. BARRE DE NAVIGATION BASSE MOBILE (IPHONE 17 PRO MAX)  */}
      {/* ======================================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E5E7EB] z-40 flex items-center justify-around px-2">
        <Link
          href="/"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors",
            pathname === "/" ? "text-[#F7162D] font-bold" : "text-[#6B7280]"
          )}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] mt-1">Accueil</span>
        </Link>

        <Link
          href="/ventes"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors",
            pathname.startsWith("/ventes") ? "text-[#F7162D] font-bold" : "text-[#6B7280]"
          )}
        >
          <ShoppingCart size={20} />
          <span className="text-[10px] mt-1">Ventes</span>
        </Link>

        {/* Bouton Central Surélevé : Création Rapide BL */}
        <Link
          href="/ventes/nouveau"
          className="relative -top-3 w-12 h-12 rounded-full bg-[#F7162D] text-white flex items-center justify-center shadow-lg active:scale-95"
          aria-label="Nouveau Bon de Livraison"
        >
          <PlusCircle size={26} />
        </Link>

        <Link
          href="/stock"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors",
            pathname.startsWith("/stock") ? "text-[#F7162D] font-bold" : "text-[#6B7280]"
          )}
        >
          <Boxes size={20} />
          <span className="text-[10px] mt-1">Stock</span>
        </Link>

        <Link
          href="/reglements"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-center transition-colors",
            pathname.startsWith("/reglements") ? "text-[#F7162D] font-bold" : "text-[#6B7280]"
          )}
        >
          <Receipt size={20} />
          <span className="text-[10px] mt-1">Crédits</span>
        </Link>
      </nav>
    </div>
    {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}
    </ToastProvider>
    </BusinessLineProvider>
    </ParametersProvider>
    </SettingsProvider>
  );
}
