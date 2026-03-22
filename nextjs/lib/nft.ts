import { encodeTxRequest } from "@/lib/tx-request";

export async function buildTransferNftTx(
  ownerPublicKey: string,
  recipientPublicKey: string,
  tokenId: number,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "nft",
    functionName: "transfer",
    args: [ownerPublicKey, recipientPublicKey, BigInt(tokenId).toString()],
  });
}

export async function buildTransferEditionTx(
  ownerPublicKey: string,
  recipientPublicKey: string,
  editionId: number,
  amount: number,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "editions",
    functionName: "safeTransferFrom",
    args: [
      ownerPublicKey,
      recipientPublicKey,
      BigInt(editionId).toString(),
      BigInt(amount).toString(),
      "0x",
    ],
  });
}

export async function buildUpdateTokenUriAsCreatorTx(
  _creatorPublicKey: string,
  tokenId: number,
  newUri: string,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "nft",
    functionName: "updateTokenUriAsCreator",
    args: [BigInt(tokenId).toString(), newUri],
  });
}

export async function buildFreezeCreatorMetadataUpdatesTx(
  _creatorPublicKey: string,
  tokenId: number,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "nft",
    functionName: "freezeCreatorMetadataUpdates",
    args: [BigInt(tokenId).toString()],
  });
}

export async function buildCreateCommissionEggTx(
  _creatorPublicKey: string,
  uri: string,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "nft",
    functionName: "createCommissionEgg",
    args: [uri],
  });
}

export async function buildCreateFinishedNftTx(
  _creatorPublicKey: string,
  uri: string,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "nft",
    functionName: "createFinishedNft",
    args: [uri],
  });
}
