export type ArtistProfile = {
  walletAddress: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  languages: string[];
  styleTags: string[];
  socialLinks: Record<string, string>;
  artistEnabled: boolean;
  commissionEnabled: boolean;
  acceptingNewClients: boolean;
  basePriceAvax: string;
  basePriceUsdc: string;
  turnaroundDaysMin: number | null;
  turnaroundDaysMax: number | null;
  slotsTotal: number | null;
  slotsOpen: number | null;
  preferredAuctionDurationHours: number | null;
  reportCount: number;
  visibilityStatus: "active" | "hidden" | "under_review";
  createdAt: number;
  updatedAt: number;
};

export type ArtistProfileUpdateInput = Partial<
  Pick<
    ArtistProfile,
    | "displayName"
    | "avatarUrl"
    | "bannerUrl"
    | "bio"
    | "languages"
    | "styleTags"
    | "socialLinks"
    | "artistEnabled"
    | "commissionEnabled"
    | "acceptingNewClients"
    | "basePriceAvax"
    | "basePriceUsdc"
    | "turnaroundDaysMin"
    | "turnaroundDaysMax"
    | "slotsTotal"
    | "slotsOpen"
    | "preferredAuctionDurationHours"
  >
>;

export type MarketplaceFeedItem = {
  id: string;
  source: "marketplace" | "auction";
  assetKind: "nft" | "commission_egg";
  saleKind: "fixed_price" | "auction" | "swap";
  status: "active" | "ended" | "sold" | "cancelled";
  tokenId: number | null;
  tokenUri: string | null;
  tokenName?: string | null;
  imageUrl?: string | null;
  metadataUrl?: string | null;
  tokenStandard?: "ERC721" | "ERC1155" | null;
  quantityAvailable?: number | null;
  sellerWallet: string | null;
  sellerProfile: ArtistProfile | null;
  /** Primary display price (formatted units string). */
  price: string | null;
  /** Currency the price is denominated in. */
  currency: "Avax" | "Usdc" | null;
  auction: {
    auctionId: number | null;
    startTime: number | null;
    endTime: number | null;
    finalized: boolean;
    currentBidAmount: string | null;
    currentBidCurrency: "Avax" | "Usdc" | null;
    bidCount: number;
  } | null;
  commissionMeta: {
    artistWallet: string | null;
    expectedTurnaroundDays: number | null;
    slotsAvailable: number | null;
    styleTags: string[];
  } | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export type MarketplaceFeedResponse = {
  items: MarketplaceFeedItem[];
  generatedAt: number;
  warnings: string[];
};

export type MyStudioNftItem = {
  tokenId: number;
  tokenUri: string;
  isCommissionEgg: boolean;
};

export type MyStudioListingItem = {
  listingId: number;
  seller: string;
  tokenId: number;
  tokenUri: string | null;
  isCommissionEgg: boolean;
  commissionEtaDays: number;
  price: string;
  currency: "Avax" | "Usdc";
  active: boolean;
};

export type MyStudioCommissionOrderItem = {
  orderId: number;
  buyer: string;
  seller: string;
  listingId: number;
  tokenId: number;
  currency: string;
  amountPaid: string;
  upfrontPaidToSeller: string;
  escrowRemaining: string;
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
};

export type MyStudioSwapListingItem = {
  swapListingId: number;
  creator: string;
  offeredTokenId: number;
  intention: string;
  active: boolean;
  bidCount: number;
};

export type MyStudioIncomingSwapBidItem = {
  bidId: number;
  listingId: number;
  bidder: string;
  bidderTokenId: number;
  listingOfferedTokenId: number;
  listingIntention: string;
  active: boolean;
};

export type MyStudioOutgoingSwapBidItem = {
  bidId: number;
  listingId: number;
  bidder: string;
  bidderTokenId: number;
  listingCreator: string;
  listingOfferedTokenId: number;
  listingIntention: string;
  active: boolean;
};

export type MarketplaceMyStudioResponse = {
  wallet: string;
  profile: ArtistProfile | null;
  ownedNfts: MyStudioNftItem[];
  myListings: MyStudioListingItem[];
  myCommissionOrdersAsArtist: MyStudioCommissionOrderItem[];
  myCommissionOrdersAsBuyer: MyStudioCommissionOrderItem[];
  mySwapListings: MyStudioSwapListingItem[];
  incomingSwapBidsForMyListings: MyStudioIncomingSwapBidItem[];
  myOutgoingSwapBids: MyStudioOutgoingSwapBidItem[];
  commissionEggLock: {
    canListNewCommissionEgg: boolean;
    reason: string | null;
    activeCommissionEggListingId: number | null;
    blockingOrderId: number | null;
  };
  auctionCapability: {
    itemAuctionsAvailable: boolean;
    reason: string;
  };
  generatedAt: number;
};

export type ArtistProfilesListResponse = {
  profiles: ArtistProfile[];
};

export type ArtistProfileChallengeResponse = {
  wallet: string;
  challengeId: string;
  message: string;
  expiresAt: number;
};

export type ArtistProfileVerifyResponse = {
  wallet: string;
  sessionToken: string;
  expiresAt: number;
  verificationMode: "evm_message";
};

export type MarketplaceReportRecord = {
  id: string;
  targetType: "artist_profile" | "listing";
  targetId: string;
  reporterWallet: string | null;
  reason: string;
  details: string;
  createdAt: number;
};
