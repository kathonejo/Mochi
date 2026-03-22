"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet-provider";
import { useLanguage } from "@/components/language-provider";
import { formatMarketplaceTokenAmount, submitContractWrite } from "@/components/marketplace-hub-shared";
import { useSiteMochi } from "@/components/site-mochi-provider";
import { buildBuyEditionAvaxTx, buildBuyEditionUsdcTx } from "@/lib/marketplace";

type Props = {
  listingId: number;
  sellerWallet: string;
  price: string;
  currency: "Avax" | "Usdc";
  remainingAmount: number;
};

export function MarketplaceEditionDetailActions({
  listingId,
  sellerWallet,
  price,
  currency,
  remainingAmount,
}: Props) {
  const router = useRouter();
  const { publicKey, isConnected, connect, signTransaction } = useWalletSession();
  const { isSpanish } = useLanguage();
  const { reloadCatalog } = useSiteMochi();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const t = (en: string, es: string) => (isSpanish ? es : en);

  async function ensureConnectedAddress() {
    if (publicKey && isConnected) return publicKey;
    await connect();
    setMessage(t("Wallet connected. Repeat the action to sign.", "Wallet conectada. Repetí la acción para firmar."));
    return null;
  }

  async function handleBuy() {
    const address = await ensureConnectedAddress();
    if (!address) return;
    if (address.toLowerCase() === sellerWallet.toLowerCase()) {
      setMessage(t("You are the seller of this edition.", "Sos el vendedor de esta edición."));
      return;
    }
    if (remainingAmount <= 0) {
      setMessage(t("This edition is sold out.", "Esta edición está agotada."));
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      const txRequest =
        currency === "Usdc"
          ? await buildBuyEditionUsdcTx(address, listingId)
          : await buildBuyEditionAvaxTx(address, listingId);
      await submitContractWrite(txRequest, signTransaction, address);
      await reloadCatalog().catch(() => undefined);
      setMessage(t("Edition purchased successfully.", "Edición comprada con éxito."));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Purchase failed.", "La compra falló."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-border bg-white/10 p-5">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t("Edition Purchase", "Compra de edición")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Buying one copy unlocks this appearance in the web app and collection.", "Comprar una copia desbloquea esta apariencia en la web app y en la colección.")}
        </p>
        <div className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-white/5 p-3">
            <p className="text-xs text-muted-foreground">{t("Price per copy", "Precio por copia")}</p>
            <p>{formatMarketplaceTokenAmount(price, currency === "Usdc" ? "USDC" : "AVAX")} {currency === "Usdc" ? "USDC" : "AVAX"}</p>
          </div>
          <div className="rounded-xl border border-border bg-white/5 p-3">
            <p className="text-xs text-muted-foreground">{t("Remaining copies", "Copias restantes")}</p>
            <p>{remainingAmount}</p>
          </div>
        </div>
        <Button onClick={() => void handleBuy()} disabled={busy || remainingAmount <= 0} className="mt-2 w-full">
          {busy ? t("Processing...", "Procesando...") : t("Buy 1 Copy", "Comprar 1 copia")}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  );
}
