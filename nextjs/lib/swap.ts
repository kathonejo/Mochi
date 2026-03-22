import { getAddress } from "viem";
import { getPublicClient, getSwapContract } from "@/lib/contracts";
import { encodeTxRequest } from "@/lib/tx-request";

export interface SwapListing {
  listingId: number;
  creator: string;
  offeredTokenId: number;
  intention: string;
  active: boolean;
}

export interface SwapBid {
  bidId: number;
  listingId: number;
  bidder: string;
  bidderTokenId: number;
  active: boolean;
}

export async function fetchSwapListings(): Promise<SwapListing[]> {
  const client = getPublicClient();
  const contract = getSwapContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalSwapListings" }));
  const listings: SwapListing[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getSwapListing", args: [BigInt(i)] });
    if (!data.active) continue;
    listings.push({
      listingId: i,
      creator: getAddress(data.creator),
      offeredTokenId: Number(data.offeredTokenId),
      intention: String(data.intention ?? ""),
      active: Boolean(data.active),
    });
  }
  return listings;
}

export async function fetchSwapBids(): Promise<SwapBid[]> {
  const client = getPublicClient();
  const contract = getSwapContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalSwapBids" }));
  const bids: SwapBid[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getSwapBid", args: [BigInt(i)] });
    if (!data.active) continue;
    bids.push({
      bidId: i,
      listingId: Number(data.listingId),
      bidder: getAddress(data.bidder),
      bidderTokenId: Number(data.bidderTokenId),
      active: Boolean(data.active),
    });
  }
  return bids;
}

export async function buildCreateSwapListingTx(_creatorPublicKey: string, offeredTokenId: number, intention: string) {
  return encodeTxRequest({ kind: "contract", contract: "swap", functionName: "createSwapListing", args: [BigInt(offeredTokenId).toString(), intention] });
}

export async function buildPlaceSwapBidTx(_bidderPublicKey: string, listingId: number, bidderTokenId: number) {
  return encodeTxRequest({ kind: "contract", contract: "swap", functionName: "placeSwapBid", args: [BigInt(listingId).toString(), BigInt(bidderTokenId).toString()] });
}

export async function buildAcceptSwapBidTx(_creatorPublicKey: string, listingId: number, bidId: number) {
  return encodeTxRequest({ kind: "contract", contract: "swap", functionName: "acceptSwapBid", args: [BigInt(listingId).toString(), BigInt(bidId).toString()] });
}

export async function buildCancelSwapListingTx(_creatorPublicKey: string, listingId: number) {
  return encodeTxRequest({ kind: "contract", contract: "swap", functionName: "cancelSwapListing", args: [BigInt(listingId).toString()] });
}

export async function buildCancelSwapBidTx(_bidderPublicKey: string, bidId: number) {
  return encodeTxRequest({ kind: "contract", contract: "swap", functionName: "cancelSwapBid", args: [BigInt(bidId).toString()] });
}
