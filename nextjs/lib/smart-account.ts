// Mochi Passport — Smart Account via ZeroDev Kernel v3 + WebAuthn Passkeys
//
// Users get a self-custodied EVM smart account backed by a passkey (fingerprint /
// face ID / device PIN).  No seed phrase, no browser extension required.
//
// Cross-platform strategy:
//   Web:        Full register + login flow in any modern browser.
//   Desktop:    App receives a short-lived "session key" (ECDSA signer with
//               scoped permissions) so the Mochi pet can interact with
//               contracts autonomously — no popup per action.
//   Extension:  Same session-key model; key is distributed via the OpenClaw
//               relay pairing that already exists in this codebase.
//
// Session-key flow (future, documented here for reference):
//   1. User authenticates on web → kernel account active.
//   2. User clicks "Link desktop" → web generates a fresh ECDSA session keypair.
//   3. The session private key is sent to the desktop (via OpenClaw relay, encrypted
//      with the desktop's public key from the pairing handshake).
//   4. The session validator is registered on the kernel account with a policy:
//      only allowed to call Mochi contracts, valid for N days.
//   5. Desktop stores the session private key in Electron's safeStorage and uses
//      it with a kernel client to sign user-ops silently.
//
// Gasless transactions:
//   Set NEXT_PUBLIC_ZERODEV_PROJECT_ID to a ZeroDev project ID that has a
//   paymaster configured (free on ZeroDev's starter plan). The paymaster
//   sponsors gas so users pay nothing for Mochi interactions.

import { createPublicClient, http } from "viem";
import { ACTIVE_CHAIN, RPC_URL, MOCHI_NETWORK } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID ?? "";
const PASSKEY_RP_ID = process.env.NEXT_PUBLIC_PASSKEY_RP_ID ?? "";

/** True when all smart-account requirements are met (project ID set, not local dev). */
export const SMART_ACCOUNT_AVAILABLE =
  Boolean(PROJECT_ID) && MOCHI_NETWORK !== "local";

const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`;
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}`;
const PASSKEY_SERVER_URL = `https://passkeys.zerodev.app/api/v2/${PROJECT_ID}`;

export type SmartAccountMode = "register" | "login";

export type SmartAccountHandle = {
  address: `0x${string}`;
  // kernelClient exposes the same surface as a viem WalletClient
  // (writeContract, sendTransaction, signMessage) but routes calls through
  // a bundler as ERC-4337 User Operations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kernelClient: any;
  publicClient: ReturnType<typeof createPublicClient>;
};

export type SmartAccountSupport = {
  supported: boolean;
  reason: string | null;
};

function getPasskeyRpId(): string {
  if (PASSKEY_RP_ID) {
    return PASSKEY_RP_ID;
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    return window.location.hostname;
  }

  return "localhost";
}

export function getSmartAccountSupport(): SmartAccountSupport {
  if (!PROJECT_ID) {
    return {
      supported: false,
      reason: "Mochi Passport is not configured for this environment yet.",
    };
  }

  if (MOCHI_NETWORK === "local") {
    return {
      supported: false,
      reason: "Mochi Passport is disabled on the local network.",
    };
  }

  if (typeof window === "undefined") {
    return {
      supported: false,
      reason: "Mochi Passport is only available in the browser.",
    };
  }

  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: "Passkeys require a secure context (HTTPS).",
    };
  }

  if (typeof window.PublicKeyCredential === "undefined") {
    return {
      supported: false,
      reason: "This browser does not support passkeys.",
    };
  }

  return {
    supported: true,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Core: create / recover a Kernel smart account via passkey
// ---------------------------------------------------------------------------

/**
 * Opens the OS WebAuthn dialog to register a new passkey or authenticate with
 * an existing one, then constructs a ZeroDev Kernel v3 smart account.
 *
 * The account address is **deterministic**: same passkey → same address every
 * time `login` is called, even on a fresh device (as long as the passkey
 * credential is available via iCloud Keychain / Google Password Manager / etc).
 */
export async function createSmartAccountFromPasskey(
  mode: SmartAccountMode,
): Promise<SmartAccountHandle> {
  const support = getSmartAccountSupport();
  if (!support.supported) {
    throw new Error(
      support.reason ??
        "NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set. Get a free project ID at https://dashboard.zerodev.app",
    );
  }

  // ZeroDev's WebAuthn helper uses Buffer in browser code paths.
  if (typeof window !== "undefined" && typeof (globalThis as { Buffer?: typeof Buffer }).Buffer === "undefined") {
    const { Buffer } = await import("buffer");
    (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
  }

  // Lazy-load heavy ZeroDev deps — only when the user explicitly picks the
  // passkey login path, to keep the main bundle lean.
  const [
    { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient },
    { toPasskeyValidator, toWebAuthnKey, WebAuthnMode, PasskeyValidatorContractVersion },
    { KERNEL_V3_1, getEntryPoint },
  ] = await Promise.all([
    import("@zerodev/sdk"),
    import("@zerodev/passkey-validator"),
    import("@zerodev/sdk/constants"),
  ]);

  const entryPoint = getEntryPoint("0.7");

  const publicClient = createPublicClient({
    chain: ACTIVE_CHAIN,
    transport: http(RPC_URL),
  });

  const rpID = getPasskeyRpId();

  // Prompt OS biometrics / PIN via the WebAuthn API
  const webAuthnKey = await toWebAuthnKey({
    rpID,
    passkeyName: "Mochi",
    passkeyServerUrl: PASSKEY_SERVER_URL,
    mode: mode === "register" ? WebAuthnMode.Register : WebAuthnMode.Login,
    passkeyServerHeaders: {},
  });

  // Build the passkey validator — the "sudo" signer for this kernel account
  const passkeyValidator = await toPasskeyValidator(publicClient, {
    webAuthnKey,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
    validatorContractVersion: PasskeyValidatorContractVersion.V0_0_3_PATCHED,
  });

  // Derive (or create) the Kernel smart-account address
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: passkeyValidator },
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });

  // Build the bundler client. We pass a ZeroDev paymaster so all transactions
  // are gas-sponsored (users pay 0 AVAX gas for Mochi interactions).
  const paymasterClient = createZeroDevPaymasterClient({
    chain: ACTIVE_CHAIN,
    transport: http(PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: ACTIVE_CHAIN,
    bundlerTransport: http(BUNDLER_RPC),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paymaster: paymasterClient as any,
  });

  return {
    address: account.address as `0x${string}`,
    kernelClient,
    publicClient,
  };
}
