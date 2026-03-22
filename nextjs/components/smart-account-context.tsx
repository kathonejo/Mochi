"use client";

import { createContext, useContext } from "react";
import type { SmartAccountHandle } from "@/lib/smart-account";

export type SmartAccountContextValue = {
  /** Whether the smart-account / passkey option is available in the current environment. */
  isSmartAccountAvailable: boolean;
  /** Current active smart account (null if using EOA or not connected). */
  smartAccountHandle: SmartAccountHandle | null;
  /** Opens the passkey register / login modal. */
  openSmartAccountModal: () => void;
  /** Clears the smart account session (logout). */
  clearSmartAccount: () => void;
};

export const SmartAccountContext = createContext<SmartAccountContextValue>({
  isSmartAccountAvailable: false,
  smartAccountHandle: null,
  openSmartAccountModal: () => {},
  clearSmartAccount: () => {},
});

export function useSmartAccount() {
  return useContext(SmartAccountContext);
}
