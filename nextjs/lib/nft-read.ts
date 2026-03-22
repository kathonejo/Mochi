import "server-only";

import { getAddress } from "viem";
import { getEditionsContract, getPublicClient, getNftContract } from "@/lib/contracts";

export type NftTokenRecord = {
  tokenId: number;
  owner: string;
  tokenUri: string;
  isCommissionEgg: boolean;
};

export type EditionTokenRecord = {
  editionId: number;
  balance: number;
  tokenUri: string;
  creator: string | null;
  totalSupply: number;
};

export async function fetchNftTotalSupply(): Promise<number> {
  const client = getPublicClient();
  const contract = getNftContract();
  const total = await client.readContract({
    ...contract,
    functionName: "totalSupply",
  });
  return Number(total ?? 0n);
}

export async function fetchNftTokenById(tokenId: number): Promise<NftTokenRecord | null> {
  try {
    const client = getPublicClient();
    const contract = getNftContract();
    const [owner, tokenUri, isCommissionEgg] = await Promise.all([
      client.readContract({ ...contract, functionName: "ownerOf", args: [BigInt(tokenId)] }),
      client.readContract({ ...contract, functionName: "tokenURI", args: [BigInt(tokenId)] }),
      client.readContract({ ...contract, functionName: "isCommissionEgg", args: [BigInt(tokenId)] }),
    ]);

    return {
      tokenId,
      owner: getAddress(owner),
      tokenUri: String(tokenUri),
      isCommissionEgg: Boolean(isCommissionEgg),
    };
  } catch {
    return null;
  }
}

export async function fetchNftCreatorById(tokenId: number): Promise<string | null> {
  try {
    const client = getPublicClient();
    const contract = getNftContract();
    const creator = await client.readContract({
      ...contract,
      functionName: "creatorOf",
      args: [BigInt(tokenId)],
    });
    return getAddress(creator);
  } catch {
    return null;
  }
}

export async function fetchNftTokensByIds(tokenIds: number[]): Promise<NftTokenRecord[]> {
  const records = await Promise.all(tokenIds.map((tokenId) => fetchNftTokenById(tokenId)));
  return records.filter((record): record is NftTokenRecord => Boolean(record));
}

export async function fetchOwnedNftsByWallet(walletAddress: string, opts?: { totalCap?: number }): Promise<NftTokenRecord[]> {
  const owner = getAddress(walletAddress);
  const totalSupply = await fetchNftTotalSupply();
  const capped = Math.min(totalSupply, opts?.totalCap ?? 500);
  const items = await Promise.all(
    Array.from({ length: capped }, (_, index) => fetchNftTokenById(index)),
  );
  const owned: NftTokenRecord[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.owner.toLowerCase() !== owner.toLowerCase()) continue;
    owned.push(item);
  }
  owned.sort((a, b) => a.tokenId - b.tokenId);
  return owned;
}

export async function fetchEditionTotalSupply(): Promise<number> {
  const client = getPublicClient();
  const contract = getEditionsContract();
  const total = await client.readContract({
    ...contract,
    functionName: "totalEditions",
  });
  return Number(total ?? 0n);
}

export async function fetchEditionTokenById(editionId: number): Promise<EditionTokenRecord | null> {
  try {
    const client = getPublicClient();
    const contract = getEditionsContract();
    const [tokenUri, creator, totalSupply] = await Promise.all([
      client.readContract({ ...contract, functionName: "uri", args: [BigInt(editionId)] }),
      client.readContract({ ...contract, functionName: "creatorOf", args: [BigInt(editionId)] }),
      client.readContract({ ...contract, functionName: "totalSupplyOf", args: [BigInt(editionId)] }),
    ]);
    return {
      editionId,
      balance: 0,
      tokenUri: String(tokenUri),
      creator: creator ? getAddress(creator) : null,
      totalSupply: Number(totalSupply ?? 0n),
    };
  } catch {
    return null;
  }
}

export async function fetchOwnedEditionsByWallet(walletAddress: string, opts?: { totalCap?: number }): Promise<EditionTokenRecord[]> {
  const owner = getAddress(walletAddress);
  const totalEditions = await fetchEditionTotalSupply();
  const capped = Math.min(totalEditions, opts?.totalCap ?? 500);
  const client = getPublicClient();
  const contract = getEditionsContract();

  const items = await Promise.all(
    Array.from({ length: capped }, async (_, index) => {
      try {
        const [balance, tokenUri, creator, totalSupply] = await Promise.all([
          client.readContract({ ...contract, functionName: "balanceOf", args: [owner, BigInt(index)] }),
          client.readContract({ ...contract, functionName: "uri", args: [BigInt(index)] }),
          client.readContract({ ...contract, functionName: "creatorOf", args: [BigInt(index)] }),
          client.readContract({ ...contract, functionName: "totalSupplyOf", args: [BigInt(index)] }),
        ]);
        const numericBalance = Number(balance ?? 0n);
        if (numericBalance <= 0) return null;
        return {
          editionId: index,
          balance: numericBalance,
          tokenUri: String(tokenUri),
          creator: creator ? getAddress(creator) : null,
          totalSupply: Number(totalSupply ?? 0n),
        } satisfies EditionTokenRecord;
      } catch {
        return null;
      }
    }),
  );

  const owned: EditionTokenRecord[] = [];
  for (const item of items) {
    if (!item) continue;
    owned.push(item);
  }
  owned.sort((a, b) => a.editionId - b.editionId);
  return owned;
}
