import { createPublicClient, getAddress, http } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import type { Abi, Address, Chain } from "viem";
import type { ContractKey } from "@/lib/tx-request";

function envTrim(value: unknown): string {
  return String(value ?? "").trim();
}

export const NFT_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS);
export const EDITIONS_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_EDITIONS_CONTRACT_ADDRESS);
export const AUCTION_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS);
export const MARKETPLACE_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_MARKETPLACE_CONTRACT_ADDRESS);
export const SWAP_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_SWAP_CONTRACT_ADDRESS);
export const COMMISSION_CONTRACT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_COMMISSION_CONTRACT_ADDRESS);
export const ESCROW_VAULT_ADDRESS = envTrim(process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS);
export const USDC_ADDRESS = envTrim(process.env.NEXT_PUBLIC_USDC_ADDRESS);
export const AVAX_USD_ORACLE_ADDRESS = envTrim(process.env.NEXT_PUBLIC_AVAX_USD_ORACLE_ADDRESS);
export const RPC_URL = envTrim(process.env.NEXT_PUBLIC_RPC_URL) || "http://127.0.0.1:8545";
export const MOCHI_NETWORK = envTrim(process.env.NEXT_PUBLIC_NETWORK) || "local";
export const USDC_ISSUER = USDC_ADDRESS;
export const NEXT_PUBLIC_CHAIN_ID = Number.parseInt(envTrim(process.env.NEXT_PUBLIC_CHAIN_ID) || "43112", 10);
export const BLOCK_EXPLORER_URL = envTrim(process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL);

export const localAvalancheChain: Chain = {
  id: NEXT_PUBLIC_CHAIN_ID,
  name: "Local Avalanche",
  nativeCurrency: {
    decimals: 18,
    name: "Avalanche",
    symbol: "AVAX",
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: BLOCK_EXPLORER_URL
    ? { default: { name: "Explorer", url: BLOCK_EXPLORER_URL } }
    : undefined,
  testnet: true,
};

export const ACTIVE_CHAIN: Chain =
  MOCHI_NETWORK === "mainnet"
    ? avalanche
    : MOCHI_NETWORK === "fuji" || MOCHI_NETWORK === "testnet"
      ? avalancheFuji
      : localAvalancheChain;

export const publicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: http(RPC_URL),
});

export function getServer() {
  return publicClient;
}

export function getPublicClient() {
  return publicClient;
}

export function safeAddress(value: string): Address {
  return getAddress(value);
}

export const nftAbi = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "creatorOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isCommissionEgg",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateTokenUriAsCreator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "newUri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "freezeCreatorMetadataUpdates",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "createCommissionEgg",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenUri", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createFinishedNft",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenUri", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export const editionsAbi = [
  {
    type: "function",
    name: "totalEditions",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "editionId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "editionId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupplyOf",
    stateMutability: "view",
    inputs: [{ name: "editionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "creatorOf",
    stateMutability: "view",
    inputs: [{ name: "editionId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setEditionUri",
    stateMutability: "nonpayable",
    inputs: [
      { name: "editionId", type: "uint256" },
      { name: "newUri", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const auctionAbi = [
  {
    type: "function",
    name: "totalAuctions",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        name: "auction",
        type: "tuple",
        components: [
          { name: "tokenUri", type: "string" },
          { name: "isItemAuction", type: "bool" },
          { name: "seller", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "startTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "startingPrice", type: "uint256" },
          { name: "currency", type: "uint8" },
          { name: "finalized", type: "bool" },
          { name: "escrowProvider", type: "uint8" },
          { name: "escrowSettled", type: "bool" }
        ]
      }
    ],
  },
  {
    type: "function",
    name: "getHighestBid",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        name: "bid",
        type: "tuple",
        components: [
          { name: "bidder", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "currency", type: "uint8" }
        ]
      }
    ],
  },
  {
    type: "function",
    name: "createItemAuction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "startingPrice", type: "uint256" },
      { name: "currency", type: "uint8" },
      { name: "durationSeconds", type: "uint64" }
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bidAvax",
    stateMutability: "payable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "bidUsdc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [],
  },
  {
    anonymous: false,
    type: "event",
    name: "BidPlaced",
    inputs: [
      { indexed: true, name: "auctionId", type: "uint256" },
      { indexed: true, name: "bidder", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "currency", type: "uint8" }
    ]
  }
] as const satisfies Abi;

export const marketplaceAbi = [
  { type: "function", name: "totalListings", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalEditionListings", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalCommissionOrders", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "getListing", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "listing", type: "tuple", components: [
      { name: "seller", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "currency", type: "uint8" },
      { name: "commissionEtaDays", type: "uint64" },
      { name: "isCommissionEgg", type: "bool" },
      { name: "active", type: "bool" }
    ]}] },
  {
    type: "function", name: "getEditionListing", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "listing", type: "tuple", components: [
      { name: "seller", type: "address" },
      { name: "editionId", type: "uint256" },
      { name: "remainingAmount", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "currency", type: "uint8" },
      { name: "active", type: "bool" }
    ]}] },
  {
    type: "function", name: "getCommissionOrder", stateMutability: "view", inputs: [{ name: "orderId", type: "uint256" }], outputs: [{ name: "order", type: "tuple", components: [
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "listingId", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "currency", type: "uint8" },
      { name: "amountPaid", type: "uint256" },
      { name: "upfrontPaidToSeller", type: "uint256" },
      { name: "escrowRemaining", type: "uint256" },
      { name: "escrowProvider", type: "uint8" },
      { name: "escrowHolder", type: "address" },
      { name: "commissionEtaDays", type: "uint64" },
      { name: "intention", type: "string" },
      { name: "referenceImageUrl", type: "string" },
      { name: "latestRevisionIntention", type: "string" },
      { name: "latestRevisionRefUrl", type: "string" },
      { name: "revisionRequestCount", type: "uint64" },
      { name: "maxRevisionRequests", type: "uint64" },
      { name: "metadataUriAtPurchase", type: "string" },
      { name: "lastDeliveredMetadataUri", type: "string" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint64" },
      { name: "deliveredAt", type: "uint64" },
      { name: "resolvedAt", type: "uint64" }
    ]}] },
  { type: "function", name: "listForSale", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }, { name: "currency", type: "uint8" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "listEditionForSale", stateMutability: "nonpayable", inputs: [{ name: "editionId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "price", type: "uint256" }, { name: "currency", type: "uint8" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "listCommissionEgg", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }, { name: "currency", type: "uint8" }, { name: "commissionEtaDays", type: "uint64" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "buyAvax", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "buyUsdc", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "buyEditionAvax", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "buyEditionUsdc", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "buyCommissionAvax", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }, { name: "intention", type: "string" }, { name: "referenceImageUrl", type: "string" }], outputs: [] },
  { type: "function", name: "buyCommissionUsdc", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }, { name: "intention", type: "string" }, { name: "referenceImageUrl", type: "string" }], outputs: [] },
  { type: "function", name: "cancelListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelEditionListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "markCommissionDelivered", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }], outputs: [] },
  { type: "function", name: "approveCommissionDelivery", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }], outputs: [] },
  { type: "function", name: "requestCommissionRevision", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }, { name: "intention", type: "string" }, { name: "referenceImageUrl", type: "string" }], outputs: [] },
  { type: "function", name: "claimCommissionTimeout", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }], outputs: [] },
  { type: "function", name: "refundCommissionOrder", stateMutability: "nonpayable", inputs: [{ name: "orderId", type: "uint256" }], outputs: [] }
] as const satisfies Abi;

export const swapAbi = [
  { type: "function", name: "totalSwapListings", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalSwapBids", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "getSwapListing", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "listing", type: "tuple", components: [
      { name: "creator", type: "address" },
      { name: "offeredTokenId", type: "uint256" },
      { name: "intention", type: "string" },
      { name: "active", type: "bool" }
    ]}] },
  {
    type: "function", name: "getSwapBid", stateMutability: "view", inputs: [{ name: "bidId", type: "uint256" }], outputs: [{ name: "bid", type: "tuple", components: [
      { name: "listingId", type: "uint256" },
      { name: "bidder", type: "address" },
      { name: "bidderTokenId", type: "uint256" },
      { name: "active", type: "bool" }
    ]}] },
  { type: "function", name: "createSwapListing", stateMutability: "nonpayable", inputs: [{ name: "offeredTokenId", type: "uint256" }, { name: "intention", type: "string" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "placeSwapBid", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }, { name: "bidderTokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "acceptSwapBid", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }, { name: "bidId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelSwapListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelSwapBid", stateMutability: "nonpayable", inputs: [{ name: "bidId", type: "uint256" }], outputs: [] }
] as const satisfies Abi;

export const commissionAbi = [
  { type: "function", name: "totalCommissions", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "getCommission", stateMutability: "view", inputs: [{ name: "commissionId", type: "uint256" }], outputs: [{ name: "commission", type: "tuple", components: [
      { name: "buyer", type: "address" },
      { name: "intention", type: "string" },
      { name: "referenceImage", type: "string" },
      { name: "priceAvax", type: "uint256" },
      { name: "priceUsdc", type: "uint256" },
      { name: "avaxUsdcRate", type: "uint256" },
      { name: "currency", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "tokenId", type: "uint256" },
      { name: "artist", type: "address" },
      { name: "createdAt", type: "uint64" }
    ]}] },
  { type: "function", name: "createCommission", stateMutability: "payable", inputs: [{ name: "intention", type: "string" }, { name: "referenceImage", type: "string" }, { name: "priceAvax", type: "uint256" }, { name: "priceUsdc", type: "uint256" }, { name: "avaxUsdcRate", type: "uint256" }, { name: "currency", type: "uint8" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "markDelivered", stateMutability: "nonpayable", inputs: [{ name: "commissionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "approveDelivery", stateMutability: "nonpayable", inputs: [{ name: "commissionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelCommission", stateMutability: "nonpayable", inputs: [{ name: "commissionId", type: "uint256" }], outputs: [] }
] as const satisfies Abi;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const satisfies Abi;

export function getAbiForContract(contract: ContractKey): Abi {
  if (contract === "nft") return nftAbi;
  if (contract === "editions") return editionsAbi;
  if (contract === "auction") return auctionAbi;
  if (contract === "marketplace") return marketplaceAbi;
  if (contract === "swap") return swapAbi;
  return commissionAbi;
}

export function getAddressForContract(contract: ContractKey): Address {
  const raw =
    contract === "nft"
      ? NFT_CONTRACT_ADDRESS
      : contract === "editions"
        ? EDITIONS_CONTRACT_ADDRESS
        : contract === "auction"
        ? AUCTION_CONTRACT_ADDRESS
        : contract === "marketplace"
          ? MARKETPLACE_CONTRACT_ADDRESS
          : contract === "swap"
            ? SWAP_CONTRACT_ADDRESS
          : COMMISSION_CONTRACT_ADDRESS;
  if (!raw) {
    throw new Error(`Missing contract address for ${contract}`);
  }
  return safeAddress(raw);
}

export function getAuctionContract() {
  return { address: getAddressForContract("auction"), abi: auctionAbi };
}

export function getMarketplaceContract() {
  return { address: getAddressForContract("marketplace"), abi: marketplaceAbi };
}

export function getCommissionContract() {
  return { address: getAddressForContract("commission"), abi: commissionAbi };
}

export function getSwapContract() {
  return { address: getAddressForContract("swap"), abi: swapAbi };
}

export function getNftContract() {
  return { address: getAddressForContract("nft"), abi: nftAbi };
}

export function getEditionsContract() {
  return { address: getAddressForContract("editions"), abi: editionsAbi };
}
