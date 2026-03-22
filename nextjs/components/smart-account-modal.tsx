"use client";

import { useState } from "react";
import { Fingerprint, Shield, Loader2, AlertCircle, X, Wallet } from "lucide-react";
import { createSmartAccountFromPasskey } from "@/lib/smart-account";
import type { SmartAccountHandle } from "@/lib/smart-account";
import { useLanguage } from "@/components/language-provider";

type Props = {
  onSuccess: (handle: SmartAccountHandle) => void;
  onClose: () => void;
  onConnectWallet: () => void;
};

type Step = "choose" | "action" | "loading" | "done" | "error";

export function SmartAccountModal({ onSuccess, onClose, onConnectWallet }: Props) {
  const { isSpanish } = useLanguage();
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const t = (en: string, es: string) => (isSpanish ? es : en);

  async function handlePasskey(mode: "register" | "login") {
    setStep("loading");
    setError(null);
    try {
      const handle = await createSmartAccountFromPasskey(mode);
      setAddress(handle.address);
      setStep("done");
      // Brief success moment before closing
      window.setTimeout(() => onSuccess(handle), 900);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("Something went wrong.", "Algo salió mal.");
      setError(message);
      setStep("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border/80 bg-card/95 p-6 shadow-[0_28px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(134,240,255,0.18),transparent_45%),linear-gradient(180deg,rgba(255,107,53,0.10),transparent)]"
          aria-hidden="true"
        />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/50 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t("Close", "Cerrar")}
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── CHOOSE ─────────────────────────────────────────────────────── */}
        {step === "choose" && (
          <div className="relative space-y-5">
            <div className="space-y-1 pr-6">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {t("Connect to Mochi", "Conectate a Mochi")}
              </h2>
              <p className="text-sm leading-6 text-foreground/80">
                {t("Choose how you want to log in.", "Elegí cómo querés iniciar sesión.")}
              </p>
            </div>

            {/* Wallet option */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onConnectWallet();
              }}
              className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-border/80 bg-secondary/55 p-4 text-left transition-all hover:border-foreground/15 hover:bg-secondary"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground group-hover:text-foreground">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("Browser Wallet", "Wallet del navegador")}
                </p>
                <p className="text-xs leading-5 text-foreground/70">
                  {t("MetaMask, Core, Rabby, WalletConnect…", "MetaMask, Core, Rabby, WalletConnect…")}
                </p>
              </div>
            </button>

            {/* Passkey option — coming soon */}
            <div
              className="flex w-full cursor-not-allowed items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left opacity-60"
              aria-disabled="true"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {t("Mochi Passport", "Mochi Passport")}
                  </p>
                  <span className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                    {t("Coming soon", "Próximamente")}
                  </span>
                </div>
                <p className="text-xs leading-5 text-foreground/50">
                  {t(
                    "Passkey smart account — powered by ZeroDev",
                    "Smart account con passkey — powered by ZeroDev",
                  )}
                </p>
              </div>
            </div>

            {/* ZeroDev note */}
            <p className="text-[11px] text-foreground/40 text-center">
              {t(
                "Mochi Passport uses ZeroDev passkey smart accounts — no seed phrase, gasless transactions.",
                "Mochi Passport usa smart accounts con passkey de ZeroDev — sin frase semilla, transacciones sin gas.",
              )}
            </p>
          </div>
        )}

        {/* ── ACTION (register or login) ───────────────────────────────── */}
        {step === "action" && (
          <div className="relative space-y-5">
            <div className="space-y-1 pr-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-400">
                <Fingerprint className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {t("Mochi Passport", "Mochi Passport")}
              </h2>
              <p className="text-sm leading-6 text-foreground/80">
                {t(
                  "Your smart account is secured by a passkey stored in your device. No seed phrases, no extensions needed.",
                  "Tu smart account está protegida por una passkey guardada en tu dispositivo. Sin frases semilla ni extensiones.",
                )}
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handlePasskey("register")}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-orange-500/55 bg-orange-500/90 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition-all hover:border-orange-400 hover:bg-orange-500"
              >
                <Fingerprint className="h-4 w-4" />
                {t("Create new Passport", "Crear nuevo Passport")}
              </button>
              <button
                type="button"
                onClick={() => void handlePasskey("login")}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border/80 bg-secondary/55 px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-secondary"
              >
                <Shield className="h-4 w-4" />
                {t("Sign in with existing Passport", "Iniciar sesión con Passport existente")}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep("choose")}
              className="w-full cursor-pointer text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("Back", "Volver")}
            </button>
          </div>
        )}

        {/* ── LOADING ─────────────────────────────────────────────────────── */}
        {step === "loading" && (
          <div className="relative flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {t("Waiting for passkey…", "Esperando passkey…")}
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground/80">
                {t(
                  "Approve the biometric prompt on your device.",
                  "Aprobá el prompt biométrico en tu dispositivo.",
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── DONE ─────────────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="relative flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/30 bg-green-500/10 text-green-300">
              <Fingerprint className="h-7 w-7" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {t("Passport activated!", "¡Passport activado!")}
              </p>
              {address && (
                <p className="mt-1 font-mono text-xs text-foreground/70">
                  {address.slice(0, 10)}...{address.slice(-8)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────────────── */}
        {step === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm leading-6 text-foreground/90">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep("action")}
              className="w-full cursor-pointer rounded-2xl border border-border/80 bg-secondary/55 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-secondary"
            >
              {t("Try again", "Reintentar")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
