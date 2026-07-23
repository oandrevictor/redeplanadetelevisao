import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "Rede Plana de Televisão",
    description: "Dirija um reality show dentro do computador antigo de uma emissora brasileira.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Rede Plana de Televisão",
      description: "Você decide o que o Brasil vê.",
      type: "website",
      locale: "pt_BR",
      images: [{ url: new URL("/og.png", base), width: 1536, height: 1024, alt: "Rede Plana de Televisão — você decide o que o Brasil vê" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Rede Plana de Televisão",
      description: "Você decide o que o Brasil vê.",
      images: [new URL("/og.png", base)],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
