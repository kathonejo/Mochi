"use client";

import { createContext, useContext } from "react";

export type WalletSessionState = {
  isAvailable: boolean;
  isDetecting: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  network: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  signTransaction: (serializedRequest: string, opts?: { address?: string }) => Promise<string>;
  signMessage: (message: string, opts?: { address?: string }) => Promise<{ signedMessage: string; signerAddress?: string }>;
};

async function unavailableAsync(message: string): Promise<never> {
  throw new Error(message);
}

export const DEFAULT_WALLET_SESSION: WalletSessionState = {
  isAvailable: false,
  isDetecting: false,
  isConnected: false,
  isConnecting: false,
  publicKey: null,
  network: null,
  error: null,
  connect: async () => {
    throw new Error("Wallet provider is not ready yet.");
  },
  disconnect: () => {},
  refresh: async () => {},
  signTransaction: (serializedRequest: string, opts?: { address?: string }) =>
    unavailableAsync("Wallet provider is not ready yet."),
  signMessage: (message: string, opts?: { address?: string }) =>
    unavailableAsync("Wallet provider is not ready yet."),
};

export const WalletSessionContext = createContext<WalletSessionState>(DEFAULT_WALLET_SESSION);

export function useWalletSession() {
  return useContext(WalletSessionContext);
}
