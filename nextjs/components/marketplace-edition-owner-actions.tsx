"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import {
  formatMarketplaceTokenAmount,
  parseMarketplaceAmountToUnits,
  submitContractWrite,
} from "@/components/marketplace-hub-shared";
import { useWalletSession } from "@/components/wallet-provider";
import { getEditionsContract, getPublicClient } from "@/lib/contracts";
import {
  buildCancelListingTx,
  buildListEditionForSaleTx,
  type EditionListingInfo,
} from "@/lib/marketplace";
import { buildTransferEditionTx } from "@/lib/nft";

type Props = {
  editionId: number;
  activeListings: EditionListingInfo[];
};

export function MarketplaceEditionOwnerActions({ editionId, activeListings }: Props) {
  const router = useRouter();
  const { isSpanish } = useLanguage();
  const { publicKey, isConnected, connect, signTransaction } = useWalletSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [ownedBalance, setOwnedBalance] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saleAmount, setSaleAmount] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [saleCurrency, setSaleCurrency] = useState<"Avax" | "Usdc">("Usdc");
  const [transferAmount, setTransferAmount] = useState("1");
  const [recipient, setRecipient] = useState("");

  const t = (en: string, es: string) => (isSpanish ? es : en);

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      if (!publicKey || !isAddress(publicKey)) {
        if (!cancelled) setOwnedBalance(0);
        return;
      }
      try {
        const client = getPublicClient();
        const contract = getEditionsContract();
        const balance = await client.readContract({
          ...contract,
          functionName: "balanceOf",
          args: [getAddress(publicKey), BigInt(editionId)],
        });
        if (!cancelled) setOwnedBalance(Number(balance ?? 0n));
      } catch {
        if (!cancelled) setOwnedBalance(0);
      }
    }
    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [editionId, publicKey, refreshKey]);

  async function ensureConnectedAddress() {
    if (publicKey && isConnected) return publicKey;
    await connect();
    setMessage(t("Wallet connected. Repeat the action to sign.", "Wallet conectada. Repetí la acción para firmar."));
    return null;
  }

  async function submitEditionListing() {
    const address = await ensureConnectedAddress();
    if (!address) return;
    const amount = Number.parseInt(saleAmount || "0", 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage(t("Enter a valid amount.", "Ingresá una cantidad válida."));
      return;
    }
    if (amount > ownedBalance) {
      setMessage(t("You do not own that many copies.", "No tenés esa cantidad de copias."));
      return;
    }

    setBusy("sale");
    setMessage("");
    try {
      const price = parseMarketplaceAmountToUnits(salePrice, saleCurrency);
      if (price <= 0n) {
        throw new Error(t("Enter a valid price.", "Ingresá un precio válido."));
      }
      const tx = await buildListEditionForSaleTx(address, editionId, amount, price, saleCurrency);
      await submitContractWrite(tx, signTransaction, address);
      setMessage(t("Edition listing created.", "Publicación de edición creada."));
      setRefreshKey((value) => value + 1);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Failed to list edition.", "No se pudo publicar la edición."));
    } finally {
      setBusy(null);
    }
  }

  async function submitEditionTransfer() {
    const address = await ensureConnectedAddress();
    if (!address) return;
    if (!isAddress(recipient.trim())) {
      setMessage(t("Enter a valid recipient wallet.", "Ingresá una wallet destino válida."));
      return;
    }
    const amount = Number.parseInt(transferAmount || "0", 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage(t("Enter a valid amount.", "Ingresá una cantidad válida."));
      return;
    }
    if (amount > ownedBalance) {
      setMessage(t("You do not own that many copies.", "No tenés esa cantidad de copias."));
      return;
    }

    setBusy("transfer");
    setMessage("");
    try {
      const tx = await buildTransferEditionTx(address, getAddress(recipient.trim()), editionId, amount);
      await submitContractWrite(tx, signTransaction, address);
      setMessage(t("Edition transfer submitted.", "Transferencia de edición enviada."));
      setRecipient("");
      setRefreshKey((value) => value + 1);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Failed to transfer edition.", "No se pudo transferir la edición."));
    } finally {
      setBusy(null);
    }
  }

  async function cancelListing(listingId: number) {
    const address = await ensureConnectedAddress();
    if (!address) return;
    setBusy(`cancel:${listingId}`);
    setMessage("");
    try {
      const tx = await buildCancelListingTx(address, listingId);
      await submitContractWrite(tx, signTransaction, address);
      setMessage(t("Listing cancelled.", "Publicación cancelada."));
      setRefreshKey((value) => value + 1);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Failed to cancel listing.", "No se pudo cancelar la publicación."));
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected || !publicKey || ownedBalance <= 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-white/10 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{t("Manage this edition", "Gestionar esta edición")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("List copies for sale, transfer them, and track active marketplace listings.", "Publicá copias, transferilas y seguí las publicaciones activas del marketplace.")}
        </p>
      </div>

      <div className="grid gap-3">
        <div className="rounded-xl border border-border bg-white/5 p-3">
          <p className="text-xs text-muted-foreground">{t("Your connected balance", "Tu balance conectado")}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{ownedBalance}</p>
        </div>

        <div className="rounded-xl border border-border bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("List copies for sale", "Publicar copias a la venta")}</p>
            {activeListings.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">{activeListings.length} {t("active", "activas")}</span>
            ) : null}
          </div>
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-[120px_1fr_120px]">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Copies", "Copias")}</span>
                <input
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={saleAmount}
                  onChange={(event) => setSaleAmount(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Price per copy", "Precio por copia")}</span>
                <input
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Currency", "Moneda")}</span>
                <select
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={saleCurrency}
                  onChange={(event) => setSaleCurrency(event.target.value as "Avax" | "Usdc")}
                >
                  <option value="Avax">AVAX</option>
                  <option value="Usdc">USDC</option>
                </select>
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
              onClick={() => void submitEditionListing()}
              disabled={Boolean(busy)}
            >
              {busy === "sale" ? t("Creating...", "Creando...") : t("Create edition listing", "Crear publicación de edición")}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white/5 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">{t("Transfer copies", "Transferir copias")}</p>
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Copies", "Copias")}</span>
                <input
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Recipient wallet", "Wallet destino")}</span>
                <input
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => void submitEditionTransfer()}
              disabled={Boolean(busy)}
            >
              {busy === "transfer" ? t("Sending...", "Enviando...") : t("Transfer edition copies", "Transferir copias")}
            </Button>
          </div>
        </div>

        {activeListings.length > 0 ? (
          <div className="rounded-xl border border-border bg-white/5 p-3">
            <p className="mb-2 text-sm font-medium text-foreground">{t("Active marketplace listings", "Publicaciones activas en marketplace")}</p>
            <div className="grid gap-2">
              {activeListings.map((listing) => (
                <div key={listing.listingId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/marketplace/edition/${listing.listingId}`} className="block text-sm font-medium text-foreground hover:underline">
                      {t("Listing", "Publicación")} #{listing.listingId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {listing.remainingAmount} {t("copies", "copias")} · {formatMarketplaceTokenAmount(listing.price, listing.currency === "Usdc" ? "USDC" : "AVAX")} {listing.currency === "Usdc" ? "USDC" : "AVAX"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void cancelListing(listing.listingId)}
                    disabled={busy === `cancel:${listing.listingId}`}
                  >
                    {busy === `cancel:${listing.listingId}` ? t("Canceling...", "Cancelando...") : t("Cancel", "Cancelar")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
    </section>
  );
}
