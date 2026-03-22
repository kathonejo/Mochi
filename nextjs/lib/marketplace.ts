import { getAddress } from "viem";
import { getMarketplaceContract, getPublicClient } from "@/lib/contracts";
import { encodeTxRequest } from "@/lib/tx-request";

export interface ListingInfo {
  listingId: number;
  seller: string;
  tokenId: number;
  price: bigint;
  currency: "Avax" | "Usdc";
  commissionEtaDays: number;
  isCommissionEgg: boolean;
  active: boolean;
}

export interface EditionListingInfo {
  listingId: number;
  seller: string;
  editionId: number;
  remainingAmount: number;
  price: bigint;
  currency: "Avax" | "Usdc";
  active: boolean;
}

export interface CommissionOrder {
  orderId: number;
  buyer: string;
  seller: string;
  listingId: number;
  tokenId: number;
  currency: "Avax" | "Usdc" | string;
  amountPaid: bigint;
  upfrontPaidToSeller: bigint;
  escrowRemaining: bigint;
  commissionEtaDays: number;
  intention: string;
  referenceImageUrl: string;
  latestRevisionIntention: string;
  latestRevisionRefUrl: string;
  revisionRequestCount: number;
  maxRevisionRequests: number;
  metadataUriAtPurchase: string;
  lastDeliveredMetadataUri: string;
  status: "Accepted" | "Delivered" | "Completed" | "Refunded" | string;
  fulfilled: boolean;
  createdAt: number;
  deliveredAt: number;
  resolvedAt: number;
}

function mapCurrency(value: number | bigint): "Avax" | "Usdc" {
  return Number(value) === 1 ? "Usdc" : "Avax";
}

function mapOrderStatus(value: number | bigint): CommissionOrder["status"] {
  const num = Number(value);
  if (num === 1) return "Delivered";
  if (num === 2) return "Completed";
  if (num === 3) return "Refunded";
  return "Accepted";
}

export async function fetchListings(): Promise<ListingInfo[]> {
  const client = getPublicClient();
  const contract = getMarketplaceContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalListings" }));
  const listings: ListingInfo[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getListing", args: [BigInt(i)] });
    if (!data.active) continue;
    listings.push({
      listingId: i,
      seller: getAddress(data.seller),
      tokenId: Number(data.tokenId),
      price: BigInt(data.price),
      currency: mapCurrency(data.currency),
      commissionEtaDays: Number(data.commissionEtaDays),
      isCommissionEgg: Boolean(data.isCommissionEgg),
      active: Boolean(data.active),
    });
  }
  return listings;
}

export async function fetchEditionListings(): Promise<EditionListingInfo[]> {
  const client = getPublicClient();
  const contract = getMarketplaceContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalEditionListings" }));
  const listings: EditionListingInfo[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getEditionListing", args: [BigInt(i)] });
    if (!data.active || Number(data.remainingAmount) <= 0) continue;
    listings.push({
      listingId: i,
      seller: getAddress(data.seller),
      editionId: Number(data.editionId),
      remainingAmount: Number(data.remainingAmount),
      price: BigInt(data.price),
      currency: mapCurrency(data.currency),
      active: Boolean(data.active),
    });
  }
  return listings;
}

export async function fetchCommissionOrders(): Promise<CommissionOrder[]> {
  const client = getPublicClient();
  const contract = getMarketplaceContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalCommissionOrders" }));
  const orders: CommissionOrder[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getCommissionOrder", args: [BigInt(i)] });
    const status = mapOrderStatus(data.status);
    orders.push({
      orderId: i,
      buyer: getAddress(data.buyer),
      seller: getAddress(data.seller),
      listingId: Number(data.listingId),
      tokenId: Number(data.tokenId),
      currency: mapCurrency(data.currency),
      amountPaid: BigInt(data.amountPaid),
      upfrontPaidToSeller: BigInt(data.upfrontPaidToSeller),
      escrowRemaining: BigInt(data.escrowRemaining),
      commissionEtaDays: Number(data.commissionEtaDays),
      intention: String(data.intention ?? ""),
      referenceImageUrl: String(data.referenceImageUrl ?? ""),
      latestRevisionIntention: String(data.latestRevisionIntention ?? ""),
      latestRevisionRefUrl: String(data.latestRevisionRefUrl ?? ""),
      revisionRequestCount: Number(data.revisionRequestCount),
      maxRevisionRequests: Number(data.maxRevisionRequests),
      metadataUriAtPurchase: String(data.metadataUriAtPurchase ?? ""),
      lastDeliveredMetadataUri: String(data.lastDeliveredMetadataUri ?? ""),
      status,
      fulfilled: status === "Completed",
      createdAt: Number(data.createdAt),
      deliveredAt: Number(data.deliveredAt),
      resolvedAt: Number(data.resolvedAt),
    });
  }
  return orders;
}

export async function buildListForSaleTx(_sellerPublicKey: string, tokenId: number, price: bigint, currency: "Avax" | "Usdc") {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "listForSale", args: [BigInt(tokenId).toString(), price.toString(), currency === "Usdc" ? 1 : 0] });
}

export async function buildListEditionForSaleTx(_sellerPublicKey: string, editionId: number, amount: number, price: bigint, currency: "Avax" | "Usdc") {
  return encodeTxRequest({
    kind: "contract",
    contract: "marketplace",
    functionName: "listEditionForSale",
    args: [BigInt(editionId).toString(), BigInt(amount).toString(), price.toString(), currency === "Usdc" ? 1 : 0],
  });
}

export async function buildListCommissionEggTx(_sellerPublicKey: string, tokenId: number, price: bigint, currency: "Avax" | "Usdc", commissionEtaDays: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "listCommissionEgg", args: [BigInt(tokenId).toString(), price.toString(), currency === "Usdc" ? 1 : 0, commissionEtaDays] });
}

async function getListingPrice(listingId: number) {
  const client = getPublicClient();
  const contract = getMarketplaceContract();
  const listing: any = await client.readContract({ ...contract, functionName: "getListing", args: [BigInt(listingId)] });
  return BigInt(listing.price ?? 0);
}

export async function buildBuyAvaxTx(_buyerPublicKey: string, listingId: number) {
  const price = await getListingPrice(listingId);
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyAvax", args: [BigInt(listingId).toString()], value: price.toString() });
}

export async function buildBuyCommissionAvaxTx(_buyerPublicKey: string, listingId: number, intention: string, referenceImageUrl: string) {
  const price = await getListingPrice(listingId);
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyCommissionAvax", args: [BigInt(listingId).toString(), intention, referenceImageUrl], value: price.toString() });
}

export async function buildBuyUsdcTx(_buyerPublicKey: string, listingId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyUsdc", args: [BigInt(listingId).toString()] });
}

export async function buildBuyEditionAvaxTx(_buyerPublicKey: string, listingId: number) {
  const client = getPublicClient();
  const contract = getMarketplaceContract();
  const listing: any = await client.readContract({ ...contract, functionName: "getEditionListing", args: [BigInt(listingId)] });
  const price = BigInt(listing.price ?? 0);
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyEditionAvax", args: [BigInt(listingId).toString()], value: price.toString() });
}

export async function buildBuyEditionUsdcTx(_buyerPublicKey: string, listingId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyEditionUsdc", args: [BigInt(listingId).toString()] });
}

export async function buildBuyCommissionUsdcTx(_buyerPublicKey: string, listingId: number, intention: string, referenceImageUrl: string) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "buyCommissionUsdc", args: [BigInt(listingId).toString(), intention, referenceImageUrl] });
}

export async function buildCancelListingTx(_sellerPublicKey: string, listingId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "cancelListing", args: [BigInt(listingId).toString()] });
}

export async function buildMarkCommissionDeliveredTx(_sellerPublicKey: string, orderId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "markCommissionDelivered", args: [BigInt(orderId).toString()] });
}

export async function buildApproveCommissionDeliveryTx(_buyerPublicKey: string, orderId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "approveCommissionDelivery", args: [BigInt(orderId).toString()] });
}

export async function buildRequestCommissionRevisionTx(_buyerPublicKey: string, orderId: number, intention: string, referenceImageUrl: string) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "requestCommissionRevision", args: [BigInt(orderId).toString(), intention, referenceImageUrl] });
}

export async function buildClaimCommissionTimeoutTx(_sellerPublicKey: string, orderId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "claimCommissionTimeout", args: [BigInt(orderId).toString()] });
}

export async function buildRefundCommissionOrderTx(_callerPublicKey: string, orderId: number) {
  return encodeTxRequest({ kind: "contract", contract: "marketplace", functionName: "refundCommissionOrder", args: [BigInt(orderId).toString()] });
}
