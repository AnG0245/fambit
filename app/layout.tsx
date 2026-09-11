import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAMBIT · Biblioteca de familias",
  description: "Tu biblioteca de familias Revit, cuentas y licencias en un solo lugar.",
  icons: {
    icon: "/brand/fambit-mark.png",
    shortcut: "/brand/fambit-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
