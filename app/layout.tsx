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
    description: "Dirija um reality show, monte cada episódio e acompanhe uma audiência ficcional que reage à edição, aos participantes e às histórias exibidas.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Rede Plana de Televisão",
      description: "Você decide o que o Brasil vê — e cada coorte reage ao seu corte.",
      type: "website",
      locale: "pt_BR",
      images: [{ url: new URL("/og-audience.png", base), width: 1536, height: 1024, alt: "Central de produção analógica da Rede Plana com monitores de audiência, retenção e transmissão ao vivo" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Rede Plana de Televisão",
      description: "Você decide o que o Brasil vê — e cada coorte reage ao seu corte.",
      images: [new URL("/og-audience.png", base)],
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
