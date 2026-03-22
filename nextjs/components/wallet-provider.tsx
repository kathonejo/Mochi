"use client";

import dynamic from "next/dynamic";
import { WalletSessionContext, DEFAULT_WALLET_SESSION, useWalletSession } from "@/components/wallet-session-context";

const WalletProviderClient = dynamic(
  () => import("@/components/wallet-provider-client").then((mod) => mod.WalletProviderClient),
  {
    ssr: false,
  },
);

const hasWalletConnectProjectId = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim());

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!hasWalletConnectProjectId) {
    return <WalletSessionContext.Provider value={DEFAULT_WALLET_SESSION}>{children}</WalletSessionContext.Provider>;
  }

  return (
    <WalletSessionContext.Provider value={DEFAULT_WALLET_SESSION}>
      <WalletProviderClient>{children}</WalletProviderClient>
    </WalletSessionContext.Provider>
  );
}

export { useWalletSession };
