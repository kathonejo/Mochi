import { NextRequest, NextResponse } from "next/server";
import { getArtistProfile, isValidWalletAddress } from "@/lib/artist-profiles-store";
import type {
  MyStudioIncomingSwapBidItem,
  MarketplaceMyStudioResponse,
  MyStudioCommissionOrderItem,
  MyStudioListingItem,
  MyStudioOutgoingSwapBidItem,
  MyStudioSwapListingItem,
} from "@/lib/marketplace-hub-types";
import {
  fetchCommissionOrders,
  fetchListings,
} from "@/lib/marketplace";
import { fetchNftTokensByIds, fetchOwnedNftsByWallet } from "@/lib/nft-read";
import { fetchSwapBids, fetchSwapListings } from "@/lib/swap";

export const runtime = "nodejs";

function serializeOrder(order: Awaited<ReturnType<typeof fetchCommissionOrders>>[number]): MyStudioCommissionOrderItem {
  return {
    orderId: order.orderId,
    buyer: order.buyer,
    seller: order.seller,
    listingId: order.listingId,
    tokenId: order.tokenId,
    currency: String(order.currency),
    amountPaid: order.amountPaid.toString(),
    upfrontPaidToSeller: order.upfrontPaidToSeller.toString(),
    escrowRemaining: order.escrowRemaining.toString(),
    commissionEtaDays: order.commissionEtaDays,
    intention: order.intention,
    referenceImageUrl: order.referenceImageUrl,
    latestRevisionIntention: order.latestRevisionIntention,
    latestRevisionRefUrl: order.latestRevisionRefUrl,
    revisionRequestCount: order.revisionRequestCount,
    maxRevisionRequests: order.maxRevisionRequests,
    metadataUriAtPurchase: order.metadataUriAtPurchase,
    lastDeliveredMetadataUri: order.lastDeliveredMetadataUri,
    status: order.status,
    fulfilled: order.fulfilled,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
    resolvedAt: order.resolvedAt,
  };
}

export async function GET(request: NextRequest) {
  const wallet = (request.nextUrl.searchParams.get("wallet") || "").trim();
  const totalCapParam = Number.parseInt(request.nextUrl.searchParams.get("totalCap") || "250", 10);
  const totalCap = Number.isFinite(totalCapParam) ? Math.max(1, Math.min(totalCapParam, 1000)) : 250;

  if (!isValidWalletAddress(wallet)) {
    return NextResponse.json(
      { error: "A valid EVM wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const [profile, ownedNfts, listings, commissionOrders, swapListings, swapBids] = await Promise.all([
      getArtistProfile(wallet),
      fetchOwnedNftsByWallet(wallet, { totalCap }),
      fetchListings(),
      fetchCommissionOrders(),
      fetchSwapListings(),
      fetchSwapBids(),
    ]);

    const myListingsRaw = listings.filter((listing) => listing.seller === wallet && listing.active);
    const missingTokenIds = myListingsRaw
      .map((listing) => listing.tokenId)
      .filter((tokenId) => !ownedNfts.some((token) => token.tokenId === tokenId));
    const extraTokens = await fetchNftTokensByIds(missingTokenIds);
    const tokenById = new Map(
      [...ownedNfts, ...extraTokens].map((token) => [token.tokenId, token]),
    );

    const myListings: MyStudioListingItem[] = myListingsRaw.map((listing) => {
      const token = tokenById.get(listing.tokenId) ?? null;
      return {
        listingId: listing.listingId,
        seller: listing.seller,
        tokenId: listing.tokenId,
        tokenUri: token?.tokenUri ?? null,
        isCommissionEgg: listing.isCommissionEgg || Boolean(token?.isCommissionEgg),
        commissionEtaDays: listing.commissionEtaDays || 0,
        price: listing.price.toString(),
        currency: listing.currency,
        active: listing.active,
      };
    });

    const myCommissionOrdersAsArtist = commissionOrders
      .filter((order) => order.seller === wallet)
      .map(serializeOrder)
      .sort((a, b) => b.createdAt - a.createdAt);

    const myCommissionOrdersAsBuyer = commissionOrders
      .filter((order) => order.buyer === wallet)
      .map(serializeOrder)
      .sort((a, b) => b.createdAt - a.createdAt);

    const swapListingById = new Map(swapListings.map((listing) => [listing.listingId, listing]));
    const mySwapListingIds = new Set(
      swapListings.filter((listing) => listing.creator === wallet && listing.active).map((listing) => listing.listingId),
    );
    const activeBidCountByListingId = new Map<number, number>();
    for (const bid of swapBids) {
      if (!bid.active) continue;
      activeBidCountByListingId.set(
        bid.listingId,
        (activeBidCountByListingId.get(bid.listingId) || 0) + 1,
      );
    }

    const mySwapListings: MyStudioSwapListingItem[] = swapListings
      .filter((listing) => listing.creator === wallet && listing.active)
      .map((listing) => ({
        swapListingId: listing.listingId,
        creator: listing.creator,
        offeredTokenId: listing.offeredTokenId,
        intention: listing.intention,
        active: listing.active,
        bidCount: activeBidCountByListingId.get(listing.listingId) || 0,
      }))
      .sort((a, b) => b.swapListingId - a.swapListingId);

    const incomingSwapBidsForMyListings: MyStudioIncomingSwapBidItem[] = swapBids
      .filter((bid) => bid.active && mySwapListingIds.has(bid.listingId))
      .map((bid) => {
        const listing = swapListingById.get(bid.listingId);
        return {
          bidId: bid.bidId,
          listingId: bid.listingId,
          bidder: bid.bidder,
          bidderTokenId: bid.bidderTokenId,
          listingOfferedTokenId: listing?.offeredTokenId ?? 0,
          listingIntention: listing?.intention ?? "",
          active: bid.active,
        };
      })
      .sort((a, b) => b.bidId - a.bidId);

    const myOutgoingSwapBids: MyStudioOutgoingSwapBidItem[] = swapBids
      .filter((bid) => bid.active && bid.bidder === wallet)
      .map((bid) => {
        const listing = swapListingById.get(bid.listingId);
        return {
          bidId: bid.bidId,
          listingId: bid.listingId,
          bidder: bid.bidder,
          bidderTokenId: bid.bidderTokenId,
          listingCreator: listing?.creator ?? "",
          listingOfferedTokenId: listing?.offeredTokenId ?? 0,
          listingIntention: listing?.intention ?? "",
          active: bid.active,
        };
      })
      .sort((a, b) => b.bidId - a.bidId);

    const activeCommissionEggListing = myListings.find((listing) => listing.isCommissionEgg && listing.active) ?? null;
    const blockingCommissionOrderAsArtist =
      myCommissionOrdersAsArtist.find(
        (order) => order.status !== "Completed" && order.status !== "Refunded",
      ) ?? null;
    const commissionEggLock =
      activeCommissionEggListing
        ? {
            canListNewCommissionEgg: false,
            reason: `You already have an active commission egg listing (#${activeCommissionEggListing.listingId}).`,
            activeCommissionEggListingId: activeCommissionEggListing.listingId,
            blockingOrderId: null,
          }
        : blockingCommissionOrderAsArtist
          ? {
              canListNewCommissionEgg: false,
              reason: `Finish or refund commission order #${blockingCommissionOrderAsArtist.orderId} before listing another commission egg.`,
              activeCommissionEggListingId: null,
              blockingOrderId: blockingCommissionOrderAsArtist.orderId,
            }
          : {
              canListNewCommissionEgg: true,
              reason: null,
              activeCommissionEggListingId: null,
              blockingOrderId: null,
            };

    const response: MarketplaceMyStudioResponse = {
      wallet,
      profile,
      ownedNfts: ownedNfts.map((token) => ({
        tokenId: token.tokenId,
        tokenUri: token.tokenUri,
        isCommissionEgg: token.isCommissionEgg,
      })),
      myListings,
      myCommissionOrdersAsArtist,
      myCommissionOrdersAsBuyer,
      mySwapListings,
      incomingSwapBidsForMyListings,
      myOutgoingSwapBids,
      commissionEggLock,
      auctionCapability: {
        itemAuctionsAvailable: true,
        reason:
          "Per-item NFT auctions are available on-chain. Commission-egg auctions should continue using fixed-price + escrow for now.",
      },
      generatedAt: Date.now(),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Marketplace my-studio API error:", error);
    return NextResponse.json(
      { error: "Failed to load studio data." },
      { status: 500 },
    );
  }
}
