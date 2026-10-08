import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Wordmark only — the interface stays on Inter.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Studio's poster caption. Self-hosted like the others, so the worker's headless
// export renderer draws the very same typeface as the preview (see render.ts).
const posterSerif = Playfair_Display({
  variable: "--font-poster-serif",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Maceut",
  description: "Scheduled traffic capture and replay for road networks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} ${posterSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-page text-text-primary">
        {children}
      </body>
    </html>
  );
}
