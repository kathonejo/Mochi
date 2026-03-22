"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultConfig, RainbowKitProvider, lightTheme, useConnectModal } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  coreWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { http } from "viem";
import {
  ACTIVE_CHAIN,
  RPC_URL,
  getAbiForContract,
  getAddressForContract,
  MOCHI_NETWORK,
} from "@/lib/contracts";
import { decodeTxRequest } from "@/lib/tx-request";
import { WalletSessionContext, type WalletSessionState } from "@/components/wallet-session-context";
import { SmartAccountContext } from "@/components/smart-account-context";
import { SmartAccountModal } from "@/components/smart-account-modal";
import { SMART_ACCOUNT_AVAILABLE } from "@/lib/smart-account";
import type { SmartAccountHandle } from "@/lib/smart-account";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const walletGroups = [
  {
    groupName: "Avalanche",
    wallets: [
      coreWallet,
      metaMaskWallet,
      coinbaseWallet,
      rabbyWallet,
      walletConnectWallet,
      injectedWallet,
    ],
  },
];

// ---------------------------------------------------------------------------
// Inner provider — handles both EOA (wagmi) and Smart Account sessions
// ---------------------------------------------------------------------------

type WalletSessionInnerProps = {
  children: React.ReactNode;
  smartAccountHandle: SmartAccountHandle | null;
  onClearSmartAccount: () => void;
  registerOpenConnectModal: (openModal: (() => void) | null) => void;
};

function WalletSessionInner({
  children,
  smartAccountHandle,
  onClearSmartAccount,
  registerOpenConnectModal,
}: WalletSessionInnerProps) {
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN.id });
  const { openConnectModal } = useConnectModal();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registerOpenConnectModal(openConnectModal ?? null);
    return () => registerOpenConnectModal(null);
  }, [openConnectModal, registerOpenConnectModal]);

  const value = useMemo<WalletSessionState>(() => {
    // ── Smart account mode ────────────────────────────────────────────────
    if (smartAccountHandle) {
      const { address: saAddress, kernelClient, publicClient: saPublicClient } = smartAccountHandle;
      return {
        isAvailable: true,
        isDetecting: false,
        isConnected: true,
        isConnecting: false,
        publicKey: saAddress,
        network: chain?.name || ACTIVE_CHAIN.name,
        error: null,
        connect: async () => {
          // Already connected via smart account; no-op.
        },
        disconnect: () => {
          onClearSmartAccount();
        },
        refresh: async () => {},
        signTransaction: async (serializedRequest: string) => {
          const request = decodeTxRequest(serializedRequest);
          // writeContract on the kernelClient automatically wraps the call
          // in an ERC-4337 UserOperation and submits it via the bundler.
          const hash = await kernelClient.writeContract({
            address: getAddressForContract(request.contract),
            abi: getAbiForContract(request.contract),
            functionName: request.functionName,
            args: request.args,
            value: request.value,
          });
          await saPublicClient.waitForTransactionReceipt({ hash });
          return hash as string;
        },
        signMessage: async (message: string) => {
          const signedMessage = await kernelClient.signMessage({ message });
          return { signedMessage, signerAddress: saAddress };
        },
      };
    }

    // ── EOA wallet mode (wagmi / RainbowKit) ─────────────────────────────
    return {
      isAvailable: typeof window !== "undefined",
      isDetecting: false,
      isConnected,
      isConnecting,
      publicKey: address ?? null,
      network: chain?.name || MOCHI_NETWORK,
      error,
      connect: async () => {
        setError(null);
        if (!openConnectModal) {
          throw new Error("No wallet connector available.");
        }
        openConnectModal();
      },
      disconnect: () => {
        setError(null);
        disconnect();
      },
      refresh: async () => {
        setError(null);
      },
      signTransaction: async (serializedRequest: string) => {
        if (!walletClient || !publicClient || !address) {
          throw new Error("No wallet connected.");
        }
        const request = decodeTxRequest(serializedRequest);
        const hash = await walletClient.writeContract({
          address: getAddressForContract(request.contract),
          abi: getAbiForContract(request.contract),
          functionName: request.functionName,
          args: request.args,
          value: request.value,
          account: address,
          chain: ACTIVE_CHAIN,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      },
      signMessage: async (message: string) => {
        if (!walletClient || !address) {
          throw new Error("No wallet connected.");
        }
        const signedMessage = await walletClient.signMessage({
          account: address,
          message,
        });
        return { signedMessage, signerAddress: address };
      },
    };
  }, [
    smartAccountHandle,
    address,
    chain?.name,
    disconnect,
    error,
    isConnected,
    isConnecting,
    onClearSmartAccount,
    openConnectModal,
    publicClient,
    walletClient,
  ]);

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

// ---------------------------------------------------------------------------
// Root client provider
// ---------------------------------------------------------------------------

export function WalletProviderClient({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() =>
    getDefaultConfig({
      appName: "Mochi",
      projectId: projectId ?? "",
      chains: [ACTIVE_CHAIN],
      wallets: walletGroups,
      ssr: false,
      transports: {
        [ACTIVE_CHAIN.id]: http(RPC_URL),
      },
    }),
  );

  // Smart account state
  const [smartAccountHandle, setSmartAccountHandle] = useState<SmartAccountHandle | null>(null);
  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
  const openWalletConnectModalRef = useRef<(() => void) | null>(null);
  const registerOpenConnectModal = useCallback((openModal: (() => void) | null) => {
    openWalletConnectModalRef.current = openModal;
  }, []);

  const smartAccountContextValue = useMemo(
    () => ({
      isSmartAccountAvailable: SMART_ACCOUNT_AVAILABLE,
      smartAccountHandle,
      openSmartAccountModal: () => setIsSmartModalOpen(true),
      clearSmartAccount: () => setSmartAccountHandle(null),
    }),
    [smartAccountHandle],
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#ff6b35",
            accentColorForeground: "#ffffff",
            borderRadius: "large",
          })}
        >
          <SmartAccountContext.Provider value={smartAccountContextValue}>
            <WalletSessionInner
              smartAccountHandle={smartAccountHandle}
              onClearSmartAccount={() => setSmartAccountHandle(null)}
              registerOpenConnectModal={registerOpenConnectModal}
            >
              {children}
            </WalletSessionInner>

            {isSmartModalOpen && (
              <SmartAccountModal
                onSuccess={(handle) => {
                  setSmartAccountHandle(handle);
                  setIsSmartModalOpen(false);
                }}
                onClose={() => setIsSmartModalOpen(false)}
                onConnectWallet={() => {
                  setIsSmartModalOpen(false);
                  window.setTimeout(() => {
                    openWalletConnectModalRef.current?.();
                  }, 0);
                }}
              />
            )}
          </SmartAccountContext.Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
