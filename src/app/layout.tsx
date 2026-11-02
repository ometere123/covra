import type { Metadata } from "next";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "COVRA — A backstop for autonomous work", template: "%s | COVRA" },
  description: "Agent-native risk coverage. Evidence-led decisions on GenLayer and USDC reserves on Base.",
  openGraph: {
    title: "COVRA — A backstop for autonomous work",
    description: "Underwrite, protect and adjudicate the autonomous economy.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
