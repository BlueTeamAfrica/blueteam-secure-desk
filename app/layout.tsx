import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/app/_components/auth/AuthContext";
import { HtmlLangSync } from "@/app/_components/HtmlLangSync";
import { getOrgSettings } from "@/app/_lib/org/getOrgSettings";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: getOrgSettings().productName,
  description: "Secure newsroom case desk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${poppins.variable} ${geistMono.variable}`}>
      <body className={`${poppins.className} app-flex-col`}>
        <HtmlLangSync />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
