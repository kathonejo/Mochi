import { NextRequest, NextResponse } from "next/server";
import { fetchAuctions } from "@/lib/auction";
import { getArtistProfilesByWallets } from "@/lib/artist-profiles-store";
import {
  type ArtistProfile,
  type MarketplaceFeedItem,
  type MarketplaceFeedResponse,
} from "@/lib/marketplace-hub-types";
import { fetchEditionListings, fetchListings } from "@/lib/marketplace";
import { fetchEditionTokenById, fetchNftTokensByIds } from "@/lib/nft-read";
import { fetchSwapListings } from "@/lib/swap";
import { fetchTokenMetadataPreview } from "@/lib/token-metadata";

export const runtime = "nodejs";

function matchesSearch(item: MarketplaceFeedItem, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  const haystack = [
    item.id,
    item.assetKind,
    item.saleKind,
    item.sellerWallet || "",
    item.tokenUri || "",
    item.tokenName || "",
    item.sellerProfile?.displayName || "",
    ...(item.sellerProfile?.styleTags ?? []),
    ...(item.sellerProfile?.languages ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function sortItems(items: MarketplaceFeedItem[], sort: string): MarketplaceFeedItem[] {
  const copy = [...items];
  if (sort === "ending_soon") {
    return copy.sort((a, b) => {
      const aEnd = a.auction?.endTime ?? Number.MAX_SAFE_INTEGER;
      const bEnd = b.auction?.endTime ?? Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });
  }
  if (sort === "price_low") {
    return copy.sort((a, b) => {
      const aPrice = Number.parseFloat(a.price || "999999999");
      const bPrice = Number.parseFloat(b.price || "999999999");
      return aPrice - bPrice;
    });
  }
  if (sort === "price_high") {
    return copy.sort((a, b) => {
      const aPrice = Number.parseFloat(a.price || "0");
      const bPrice = Number.parseFloat(b.price || "0");
      return bPrice - aPrice;
    });
  }
  return copy;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const assetKindFilter = (searchParams.get("assetKind") || "all").toLowerCase();
  const saleKindFilter = (searchParams.get("saleKind") || "all").toLowerCase();
  const search = (searchParams.get("search") || "").trim().slice(0, 120);
  const sort = (searchParams.get("sort") || "ending_soon").toLowerCase();
  const warnings: string[] = [];

  try {
    const [listings, editionListings, auctions, swapListings] = await Promise.all([
      fetchListings().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to load marketplace listings. ${message}`);
        return [];
      }),
      fetchEditionListings().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to load marketplace edition listings. ${message}`);
        return [];
      }),
      fetchAuctions({ includeEnded: false, limit: 100 }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to load auctions. ${message}`);
        return [];
      }),
      fetchSwapListings().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to load swap listings. ${message}`);
        return [];
      }),
    ]);

    const itemAuctionTokenIds = auctions
      .filter((snapshot) => snapshot.auction.isItemAuction && snapshot.auction.tokenId !== null)
      .map((snapshot) => snapshot.auction.tokenId as number);
    const swapTokenIds = [
      ...swapListings.map((listing) => listing.offeredTokenId),
    ];

    const tokenRecords = await fetchNftTokensByIds([
      ...listings.map((listing) => listing.tokenId),
      ...itemAuctionTokenIds,
      ...swapTokenIds,
    ]).catch(() => {
      warnings.push("Failed to enrich listings with NFT metadata.");
      return [];
    });
    const tokenById = new Map(tokenRecords.map((record) => [record.tokenId, record]));
    const editionRecords = await Promise.all(
      editionListings.map((listing) => fetchEditionTokenById(listing.editionId)),
    ).catch(() => {
      warnings.push("Failed to enrich edition listings with metadata.");
      return [];
    });
    const editionById = new Map<number, NonNullable<(typeof editionRecords)[number]>>();
    for (const record of editionRecords) {
      if (!record) continue;
      editionById.set(record.editionId, record);
    }

    const metadataUris = Array.from(
      new Set(
        [
          ...tokenRecords.map((record) => record.tokenUri),
          ...editionRecords.map((record) => record?.tokenUri ?? null),
        ].filter((uri): uri is string => Boolean(uri)),
      ),
    );
    const metadataEntries = await Promise.all(
      metadataUris.map(async (uri) => [uri, await fetchTokenMetadataPreview(uri)] as const),
    ).catch(() => {
      warnings.push("Failed to load token metadata previews.");
      return [] as Array<readonly [string, Awaited<ReturnType<typeof fetchTokenMetadataPreview>>]>;
    });
    const metadataByUri = new Map(metadataEntries);

    const sellerProfiles: Record<string, ArtistProfile> = await getArtistProfilesByWallets(
      [
        ...listings.map((listing) => listing.seller),
        ...auctions
          .filter((snapshot) => snapshot.auction.isItemAuction && snapshot.auction.seller)
          .map((snapshot) => snapshot.auction.seller as string),
        ...swapListings.map((listing) => listing.creator),
      ],
    ).catch(() => {
      warnings.push("Failed to load artist profiles.");
      return {} as Record<string, ArtistProfile>;
    });

    const now = Math.floor(Date.now() / 1000);
    const listingItems: MarketplaceFeedItem[] = listings.map((listing) => {
      const token = tokenById.get(listing.tokenId) ?? null;
      const sellerProfile = sellerProfiles[listing.seller] ?? null;
      const isCommissionEgg = listing.isCommissionEgg || Boolean(token?.isCommissionEgg);
      return {
        id: `listing:${listing.listingId}`,
        source: "marketplace",
        assetKind: isCommissionEgg ? "commission_egg" : "nft",
        saleKind: "fixed_price",
        status: listing.active ? "active" : "cancelled",
        tokenId: listing.tokenId,
        tokenUri: token?.tokenUri ?? null,
        tokenName: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.name ?? null) : null,
        imageUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.imageUrl ?? null) : null,
        metadataUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.metadataUrl ?? null) : null,
        tokenStandard: "ERC721",
        quantityAvailable: 1,
        sellerWallet: listing.seller,
        sellerProfile,
        price: listing.price.toString(),
        currency: listing.currency,
        auction: null,
        commissionMeta: isCommissionEgg
          ? {
              artistWallet: listing.seller,
              expectedTurnaroundDays: listing.commissionEtaDays || sellerProfile?.turnaroundDaysMax || null,
              slotsAvailable: sellerProfile?.slotsOpen ?? null,
              styleTags: sellerProfile?.styleTags ?? [],
            }
          : null,
        createdAt: null,
        updatedAt: null,
      };
    });

    const editionListingItems: MarketplaceFeedItem[] = editionListings.map((listing) => {
      const token = editionById.get(listing.editionId) ?? null;
      const sellerProfile = sellerProfiles[listing.seller] ?? null;
      return {
        id: `edition_listing:${listing.listingId}`,
        source: "marketplace",
        assetKind: "nft",
        saleKind: "fixed_price",
        status: listing.active ? "active" : "cancelled",
        tokenId: listing.editionId,
        tokenUri: token?.tokenUri ?? null,
        tokenName: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.name ?? null) : null,
        imageUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.imageUrl ?? null) : null,
        metadataUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.metadataUrl ?? null) : null,
        tokenStandard: "ERC1155",
        quantityAvailable: listing.remainingAmount,
        sellerWallet: listing.seller,
        sellerProfile,
        price: listing.price.toString(),
        currency: listing.currency,
        auction: null,
        commissionMeta: null,
        createdAt: null,
        updatedAt: null,
      };
    });

    const auctionItems: MarketplaceFeedItem[] = auctions
      .filter((snapshot) => snapshot.auction.isItemAuction)
      .map((snapshot) => {
      const auction = snapshot.auction;
      const isItemAuction = auction.isItemAuction;
      const token =
        isItemAuction && auction.tokenId !== null ? (tokenById.get(auction.tokenId) ?? null) : null;
      const sellerWallet = isItemAuction ? auction.seller : null;
      const sellerProfile = sellerWallet ? (sellerProfiles[sellerWallet] ?? null) : null;
      const isCommissionEgg = Boolean(token?.isCommissionEgg);

      return {
        id: `auction:${snapshot.auctionId}`,
        source: "auction",
        assetKind: isCommissionEgg ? "commission_egg" : "nft",
        saleKind: "auction",
        status: auction.finalized || auction.endTime <= now ? "ended" : "active",
        tokenId: isItemAuction ? (auction.tokenId ?? null) : null,
        tokenUri: token?.tokenUri ?? auction.tokenUri ?? null,
        tokenName:
          token?.tokenUri
            ? (metadataByUri.get(token.tokenUri)?.name ?? null)
            : auction.tokenUri
              ? (metadataByUri.get(auction.tokenUri)?.name ?? null)
              : null,
        imageUrl:
          token?.tokenUri
            ? (metadataByUri.get(token.tokenUri)?.imageUrl ?? null)
            : auction.tokenUri
              ? (metadataByUri.get(auction.tokenUri)?.imageUrl ?? null)
              : null,
        metadataUrl:
          token?.tokenUri
            ? (metadataByUri.get(token.tokenUri)?.metadataUrl ?? null)
            : auction.tokenUri
              ? (metadataByUri.get(auction.tokenUri)?.metadataUrl ?? null)
              : null,
        tokenStandard: "ERC721",
        quantityAvailable: 1,
        sellerWallet,
        sellerProfile,
        price: auction.startingPrice.toString(),
        currency: auction.currency,
        auction: {
          auctionId: snapshot.auctionId,
          startTime: auction.startTime,
          endTime: auction.endTime,
          finalized: auction.finalized,
          currentBidAmount: snapshot.highestBid?.amount.toString() ?? null,
          currentBidCurrency: snapshot.highestBid?.currency ?? null,
          bidCount: snapshot.highestBid ? 1 : 0,
        },
        commissionMeta:
          isCommissionEgg && sellerWallet
            ? {
                artistWallet: sellerWallet,
                expectedTurnaroundDays: sellerProfile?.turnaroundDaysMax ?? null,
                slotsAvailable: sellerProfile?.slotsOpen ?? null,
                styleTags: sellerProfile?.styleTags ?? [],
              }
            : null,
        createdAt: auction.startTime,
        updatedAt: auction.endTime,
      };
    });

    const swapListingItems: MarketplaceFeedItem[] = swapListings.map((listing) => {
      const token = tokenById.get(listing.offeredTokenId) ?? null;
      const sellerProfile = sellerProfiles[listing.creator] ?? null;
      const isCommissionEgg = Boolean(token?.isCommissionEgg);

      return {
        id: `swap_listing:${listing.listingId}`,
        source: "marketplace",
        assetKind: isCommissionEgg ? "commission_egg" : "nft",
        saleKind: "swap",
        status: listing.active ? "active" : "cancelled",
        tokenId: listing.offeredTokenId,
        tokenUri: token?.tokenUri ?? null,
        tokenName: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.name ?? null) : null,
        imageUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.imageUrl ?? null) : null,
        metadataUrl: token?.tokenUri ? (metadataByUri.get(token.tokenUri)?.metadataUrl ?? null) : null,
        tokenStandard: "ERC721",
        quantityAvailable: 1,
        sellerWallet: listing.creator,
        sellerProfile,
        price: null,
        currency: null,
        auction: null,
        commissionMeta:
          isCommissionEgg
            ? {
                artistWallet: listing.creator,
                expectedTurnaroundDays: sellerProfile?.turnaroundDaysMax ?? null,
                slotsAvailable: sellerProfile?.slotsOpen ?? null,
                styleTags: sellerProfile?.styleTags ?? [],
              }
            : null,
        createdAt: null,
        updatedAt: null,
      };
    });

    let items = [...auctionItems, ...listingItems, ...editionListingItems, ...swapListingItems];

    if (assetKindFilter === "nft" || assetKindFilter === "commission_egg") {
      items = items.filter((item) => item.assetKind === assetKindFilter);
    }
    if (saleKindFilter === "fixed_price" || saleKindFilter === "auction" || saleKindFilter === "swap") {
      items = items.filter((item) => item.saleKind === saleKindFilter);
    }
    items = items.filter((item) => matchesSearch(item, search));
    items = sortItems(items, sort);

    const response: MarketplaceFeedResponse = {
      items,
      warnings,
      generatedAt: Date.now(),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Marketplace feed API error:", error);
    return NextResponse.json(
      { error: "Failed to load marketplace feed." },
      { status: 500 },
    );
  }
}
