import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { cookies } from "next/headers";
import { getBusinessLines, getPublicSettings, getParameters } from "@/lib/queries/layout";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { isLiveSession } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F7162D",
};

export const metadata: Metadata = {
  title: "BM Motors | ERP Pièces Moto & Stock (Bashan)",
  description: "Système de gestion commerciale, comptoir, stock et facturation pour BM Motors SARL",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BM Motors",
  },
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: "/apple-touch-icon.png",
  },
  // Application interne : ne jamais indexer, suivre ni archiver (aucun domaine autorisé).
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Rendu aussi sur /login : aucune donnée société/paramètres sans session valide.
  const authenticated = await isLiveSession((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  const [lines, settings, parameters] = authenticated
    ? await Promise.all([getBusinessLines(), getPublicSettings(), getParameters()])
    : [[], null, null];
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#F8F9FA] text-[#111827]" suppressHydrationWarning>
        <ServiceWorkerRegister />
        <AppShell lines={lines} settings={settings} parameters={parameters}>{children}</AppShell>
      </body>
    </html>

  );
}
