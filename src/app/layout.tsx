import type { Metadata } from "next";
import "./globals.css";

import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "Build Your XI",
  description: "Adapt. Build. Conquer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col grid-bg">
          <AppHeader />

          <div className="flex min-h-0 flex-1 flex-col">
            {children}
          </div>

          <AppFooter />
        </div>
      </body>
    </html>
  );
}