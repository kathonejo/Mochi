import { getAddress } from "viem";
import { auctionAbi, getAuctionContract, getPublicClient } from "@/lib/contracts";
import { encodeTxRequest } from "@/lib/tx-request";

export interface AuctionInfo {
  tokenUri: string;
  isItemAuction: boolean;
  seller: string | null;
  tokenId: number | null;
  startTime: number;
  endTime: number;
  startingPrice: bigint;
  currency: "Avax" | "Usdc";
  finalized: boolean;
  escrowProvider: "Internal" | string | null;
  escrowSettled: boolean;
}

export interface BidInfo {
  bidder: string;
  amount: bigint;
  currency: "Avax" | "Usdc";
}

export interface AuctionSnapshot {
  auction: AuctionInfo;
  highestBid: BidInfo | null;
  auctionId: number;
}

function mapCurrency(value: number | bigint): "Avax" | "Usdc" {
  return Number(value) === 1 ? "Usdc" : "Avax";
}

function mapEscrowProvider(_value: number | bigint): "Internal" {
  return "Internal";
}

function mapAuctionInfo(raw: any): AuctionInfo {
  return {
    tokenUri: String(raw.tokenUri ?? ""),
    isItemAuction: Boolean(raw.isItemAuction),
    seller: raw.seller ? getAddress(raw.seller) : null,
    tokenId: raw.isItemAuction ? Number(raw.tokenId ?? 0n) : null,
    startTime: Number(raw.startTime ?? 0n),
    endTime: Number(raw.endTime ?? 0n),
    startingPrice: BigInt(raw.startingPrice ?? 0n),
    currency: mapCurrency(raw.currency ?? 0),
    finalized: Boolean(raw.finalized),
    escrowProvider: mapEscrowProvider(raw.escrowProvider ?? 0),
    escrowSettled: Boolean(raw.escrowSettled),
  };
}

function mapBidInfo(raw: any): BidInfo | null {
  if (!raw || !raw.bidder || /^0x0{40}$/i.test(String(raw.bidder))) return null;
  return {
    bidder: getAddress(raw.bidder),
    amount: BigInt(raw.amount ?? 0n),
    currency: mapCurrency(raw.currency ?? 0),
  };
}

export async function fetchRecentBidsForAuction(auctionId: number, _auctionStartTime: number, limit = 8): Promise<BidInfo[]> {
  try {
    const client = getPublicClient();
    const contract = getAuctionContract();
    const logs = await client.getLogs({
      address: contract.address,
      event: auctionAbi.find((entry) => entry.type === "event" && entry.name === "BidPlaced") as any,
      args: { auctionId: BigInt(auctionId) },
      fromBlock: 0n,
      toBlock: "latest",
    });
    return logs
      .slice(-limit)
      .reverse()
      .map((log) => {
        const args = (log as any).args ?? {};
        return {
          bidder: getAddress(String(args.bidder)),
          amount: BigInt(args.amount ?? 0n),
          currency: mapCurrency(args.currency ?? 0),
        };
      });
  } catch {
    return [];
  }
}

export async function fetchAuctions(opts?: {
  includeEnded?: boolean;
  includeSystem?: boolean;
  includeItemAuctions?: boolean;
  limit?: number;
}): Promise<AuctionSnapshot[]> {
  const client = getPublicClient();
  const contract = getAuctionContract();
  const total = Number(
    await client.readContract({
      ...contract,
      functionName: "totalAuctions",
    }),
  );
  const includeEnded = Boolean(opts?.includeEnded);
  const includeItemAuctions = opts?.includeItemAuctions ?? true;
  const limit = opts?.limit ?? Number.POSITIVE_INFINITY;
  const result: AuctionSnapshot[] = [];

  for (let index = total - 1; index >= 0; index -= 1) {
    const [auctionRaw, bidRaw] = await Promise.all([
      client.readContract({ ...contract, functionName: "getAuction", args: [BigInt(index)] }),
      client.readContract({ ...contract, functionName: "getHighestBid", args: [BigInt(index)] }),
    ]);
    const auction = mapAuctionInfo(auctionRaw as any);
    if (!includeItemAuctions && auction.isItemAuction) continue;
    if (!includeEnded && (auction.finalized || auction.endTime <= Math.floor(Date.now() / 1000))) continue;
    result.push({ auction, highestBid: mapBidInfo(bidRaw as any), auctionId: index });
    if (result.length >= limit) break;
  }

  return result;
}

export async function fetchActiveAuction() {
  const auctions = await fetchAuctions({ includeEnded: false, includeItemAuctions: true, limit: 20 });
  if (auctions.length === 0) return null;
  const selected = auctions[0];
  const recentBids = await fetchRecentBidsForAuction(selected.auctionId, selected.auction.startTime, 8);
  return {
    auction: selected.auction,
    highestBid: selected.highestBid,
    recentBids,
    auctionId: selected.auctionId,
  };
}

export async function buildBidAvaxTx(_sourcePublicKey: string, auctionId: number, amount: bigint): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "auction",
    functionName: "bidAvax",
    args: [BigInt(auctionId).toString()],
    value: amount.toString(),
  });
}

export async function buildCreateItemAuctionTx(
  _sourcePublicKey: string,
  tokenId: number,
  startingPrice: bigint,
  currency: "Avax" | "Usdc",
  durationSeconds: number,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "auction",
    functionName: "createItemAuction",
    args: [BigInt(tokenId).toString(), startingPrice.toString(), currency === "Usdc" ? 1 : 0, durationSeconds],
  });
}

export async function buildBidUsdcTx(_sourcePublicKey: string, auctionId: number, amount: bigint): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "auction",
    functionName: "bidUsdc",
    args: [BigInt(auctionId).toString(), amount.toString()],
  });
}
