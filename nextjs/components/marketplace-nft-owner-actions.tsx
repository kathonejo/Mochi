"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet-provider";
import { useLanguage } from "@/components/language-provider";
import { parseMarketplaceAmountToUnits, submitContractWrite } from "@/components/marketplace-hub-shared";
import { buildCreateItemAuctionTx } from "@/lib/auction";
import { buildCreateSwapListingTx } from "@/lib/swap";
import {
  buildListCommissionEggTx,
  buildListForSaleTx,
} from "@/lib/marketplace";
import { buildTransferNftTx } from "@/lib/nft";

type Props = {
  tokenId: number;
  tokenOwner: string;
  isCommissionEgg: boolean;
  hasActiveListing: boolean;
  hasActiveAuction: boolean;
};

export function MarketplaceNftOwnerActions({
  tokenId,
  tokenOwner,
  isCommissionEgg,
  hasActiveListing,
  hasActiveAuction,
}: Props) {
  const router = useRouter();
  const { publicKey, isConnected, signTransaction } = useWalletSession();
  const { isSpanish } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [salePrice, setSalePrice] = useState("");
  const [saleCurrency, setSaleCurrency] = useState<"Avax" | "Usdc">("Usdc");
  const [commissionEtaDays, setCommissionEtaDays] = useState("7");

  const [auctionPrice, setAuctionPrice] = useState("");
  const [auctionCurrency, setAuctionCurrency] = useState<"Avax" | "Usdc">("Usdc");
  const [auctionDurationHours, setAuctionDurationHours] = useState("24");
  const [swapIntention, setSwapIntention] = useState("");
  const [transferRecipient, setTransferRecipient] = useState("");

  const isOwner = Boolean(publicKey && publicKey === tokenOwner);
  const t = (en: string, es: string) => (isSpanish ? es : en);

  async function submitListing() {
    if (!publicKey || !isOwner) return;
    setBusy("sale");
    setMessage("");
    try {
      const price = parseMarketplaceAmountToUnits(salePrice, saleCurrency);
      if (price <= BigInt(0)) {
        throw new Error(t("Enter a valid price.", "Ingresá un precio válido."));
      }
      const etaDays = Math.max(1, Number.parseInt(commissionEtaDays || "7", 10) || 7);
      const txXdr = isCommissionEgg
        ? await buildListCommissionEggTx(publicKey, tokenId, price, saleCurrency, etaDays)
        : await buildListForSaleTx(publicKey, tokenId, price, saleCurrency);
      await submitContractWrite(txXdr, signTransaction, publicKey);
      setMessage(t("Sale listing created.", "Publicación de venta creada."));
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("Failed to create sale listing.", "No se pudo crear la publicación de venta."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitAuction() {
    if (!publicKey || !isOwner) return;
    setBusy("auction");
    setMessage("");
    try {
      if (isCommissionEgg) {
        throw new Error(
          t(
            "Commission eggs should use fixed-price listing.",
            "Los huevos de comisión deben usar venta a precio fijo.",
          ),
        );
      }
      const price = parseMarketplaceAmountToUnits(auctionPrice, auctionCurrency);
      if (price <= BigInt(0)) {
        throw new Error(t("Enter a valid starting price.", "Ingresá un precio inicial válido."));
      }
      const durationHours = Math.max(1, Number.parseInt(auctionDurationHours || "24", 10) || 24);
      const txXdr = await buildCreateItemAuctionTx(
        publicKey,
        tokenId,
        price,
        auctionCurrency,
        durationHours * 3600,
      );
      await submitContractWrite(txXdr, signTransaction, publicKey);
      setMessage(t("Auction created.", "Subasta creada."));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Failed to create auction.", "No se pudo crear la subasta."));
    } finally {
      setBusy(null);
    }
  }

  async function submitSwapListing() {
    if (!publicKey || !isOwner) return;
    setBusy("swap");
    setMessage("");
    try {
      if (!swapIntention.trim()) {
        throw new Error(t("Add the swap intention first.", "Primero agregá la intención de intercambio."));
      }
      const txXdr = await buildCreateSwapListingTx(publicKey, tokenId, swapIntention.trim());
      await submitContractWrite(txXdr, signTransaction, publicKey);
      setMessage(t("Open swap listing created.", "Publicación de intercambio abierta creada."));
      setSwapIntention("");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("Failed to create swap listing.", "No se pudo crear la publicación de intercambio."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitTransfer() {
    if (!publicKey || !isOwner) return;
    setBusy("transfer");
    setMessage("");
    try {
      const recipient = transferRecipient.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
        throw new Error(t("Enter a valid recipient wallet.", "Ingresá una wallet destino válida."));
      }
      const txXdr = await buildTransferNftTx(publicKey, recipient, tokenId);
      await submitContractWrite(txXdr, signTransaction, publicKey);
      setTransferRecipient("");
      setMessage(t("NFT transfer submitted.", "Transferencia de NFT enviada."));
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("Failed to transfer NFT.", "No se pudo transferir el NFT."),
      );
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected || !publicKey) return null;

  if (!isOwner) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-white/10 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{t("Manage this NFT", "Gestionar este NFT")}</h2>
        <p className="text-xs text-muted-foreground">
          {t(
            "Create a sale, auction, or open swap listing from here.",
            "Creá una venta, subasta o intercambio abierto desde acá.",
          )}
        </p>
        {isCommissionEgg ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Commission eggs use 50/50 escrow (upfront + final release), buyer approval, and up to 3 change requests.",
              "Los huevos de comisión usan escrow 50/50 (anticipo + liberación final), aprobación del comprador y hasta 3 pedidos de cambio.",
            )}{" "}
            <Link href="/marketplace/commissions" className="cursor-pointer underline hover:text-foreground">
              {t("Manual", "Manual")}
            </Link>
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("Sale", "Venta")}</p>
            {hasActiveListing ? (
              <span className="text-[11px] text-muted-foreground">{t("Already active", "Ya activa")}</span>
            ) : null}
          </div>
          {hasActiveListing ? null : (
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{t("Price", "Precio")}</span>
                  <input
                    className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                    value={salePrice}
                    onChange={(event) => setSalePrice(event.target.value)}
                    placeholder="0"
                    inputMode="decimal"
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
              {isCommissionEgg ? (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{t("Estimated delivery (days)", "Entrega estimada (días)")}</span>
                  <input
                    className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                    value={commissionEtaDays}
                    onChange={(event) => setCommissionEtaDays(event.target.value)}
                    placeholder="7"
                    inputMode="numeric"
                  />
                </label>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
                onClick={() => void submitListing()}
                disabled={Boolean(busy)}
              >
                {busy === "sale" ? t("Creating...", "Creando...") : t("Create sale", "Crear venta")}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("Auction", "Subasta")}</p>
            {isCommissionEgg ? (
              <span className="text-[11px] text-muted-foreground">
                {t("Not available for commission eggs", "No disponible para huevos de comisión")}
              </span>
            ) : hasActiveAuction ? (
              <span className="text-[11px] text-muted-foreground">{t("Already active", "Ya activa")}</span>
            ) : null}
          </div>
          {isCommissionEgg || hasActiveAuction ? null : (
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{t("Starting price", "Precio inicial")}</span>
                  <input
                    className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                    value={auctionPrice}
                    onChange={(event) => setAuctionPrice(event.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{t("Currency", "Moneda")}</span>
                  <select
                    className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                    value={auctionCurrency}
                    onChange={(event) => setAuctionCurrency(event.target.value as "Avax" | "Usdc")}
                  >
                    <option value="Avax">AVAX</option>
                    <option value="Usdc">USDC</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{t("Duration (hours)", "Duración (horas)")}</span>
                <input
                  className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                  value={auctionDurationHours}
                  onChange={(event) => setAuctionDurationHours(event.target.value)}
                  placeholder="24"
                  inputMode="numeric"
                />
              </label>
              <Button
                type="button"
                size="sm"
                className="w-full bg-amber-400 text-black hover:bg-amber-300"
                onClick={() => void submitAuction()}
                disabled={Boolean(busy) || hasActiveListing}
              >
                {busy === "auction"
                  ? t("Creating...", "Creando...")
                  : hasActiveListing
                    ? t("Cancel sale first", "Cancelá la venta primero")
                    : t("Create auction", "Crear subasta")}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white/5 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">{t("Swap", "Intercambio")}</p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t(
              "Publish an open swap listing with only an intention. Other users can offer one of their NFTs.",
              "Publicá un intercambio abierto solo con una intención. Otras personas pueden ofrecer uno de sus NFTs.",
            )}
          </p>
          <div className="grid gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>{t("Swap intention", "Intención de intercambio")}</span>
              <textarea
                className="min-h-20 rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                value={swapIntention}
                onChange={(event) => setSwapIntention(event.target.value)}
                placeholder={t(
                  "What kind of mochi are you looking for? Style, traits, rarity, etc.",
                  "¿Qué tipo de mochi buscás? Estilo, rasgos, rareza, etc.",
                )}
              />
            </label>
            <Button
              type="button"
              size="sm"
              className="w-full bg-sky-400 text-sky-950 hover:bg-sky-300"
              onClick={() => void submitSwapListing()}
              disabled={Boolean(busy) || hasActiveListing || hasActiveAuction}
            >
              {busy === "swap"
                ? t("Creating...", "Creando...")
                : hasActiveListing
                  ? t("Cancel sale first", "Cancelá la venta primero")
                  : hasActiveAuction
                    ? t("End auction first", "Finalizá la subasta primero")
                    : t("Create open swap listing", "Crear intercambio abierto")}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white/5 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">{t("Transfer", "Transferir")}</p>
          <div className="grid gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>{t("Recipient wallet", "Wallet destino")}</span>
              <input
                className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground"
                value={transferRecipient}
                onChange={(event) => setTransferRecipient(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => void submitTransfer()}
              disabled={Boolean(busy)}
            >
              {busy === "transfer" ? t("Sending...", "Enviando...") : t("Transfer NFT", "Transferir NFT")}
            </Button>
          </div>
        </div>
      </div>

      {message ? (
        <p className="mt-3 text-xs text-muted-foreground">{message}</p>
      ) : null}
    </section>
  );
}
