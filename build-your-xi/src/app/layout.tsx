import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Build Your XI", description: "Adapt. Build. Conquer." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
