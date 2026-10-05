import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

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
    icon: "/bashan-logo.png",
    apple: "/bashan-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#F8F9FA] text-[#111827]" suppressHydrationWarning>
        <ServiceWorkerRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>

  );
}
