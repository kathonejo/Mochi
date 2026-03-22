import { getAddress } from "viem";
import { getCommissionContract, getPublicClient } from "@/lib/contracts";
import { encodeTxRequest } from "@/lib/tx-request";

export type CommissionStatus = "Open" | "Accepted" | "Delivered" | "Completed" | "Cancelled";
export type CommissionCurrency = "Avax" | "Usdc";

export interface CommissionRequest {
  commissionId: number;
  buyer: string;
  intention: string;
  referenceImage: string;
  priceAvax: bigint;
  priceUsdc: bigint;
  avaxUsdcRate: bigint;
  currency: CommissionCurrency;
  status: CommissionStatus;
  tokenId: number;
  artist: string;
  createdAt: number;
}

function mapCurrency(value: number | bigint): CommissionCurrency {
  return Number(value) === 1 ? "Usdc" : "Avax";
}

function mapStatus(value: number | bigint): CommissionStatus {
  const num = Number(value);
  if (num === 1) return "Accepted";
  if (num === 2) return "Delivered";
  if (num === 3) return "Completed";
  if (num === 4) return "Cancelled";
  return "Open";
}

export async function fetchCommissions(): Promise<CommissionRequest[]> {
  const client = getPublicClient();
  const contract = getCommissionContract();
  const total = Number(await client.readContract({ ...contract, functionName: "totalCommissions" }));
  const items: CommissionRequest[] = [];
  for (let i = 0; i < total; i += 1) {
    const data: any = await client.readContract({ ...contract, functionName: "getCommission", args: [BigInt(i)] });
    items.push({
      commissionId: i,
      buyer: getAddress(data.buyer),
      intention: String(data.intention ?? ""),
      referenceImage: String(data.referenceImage ?? ""),
      priceAvax: BigInt(data.priceAvax ?? 0),
      priceUsdc: BigInt(data.priceUsdc ?? 0),
      avaxUsdcRate: BigInt(data.avaxUsdcRate ?? 0),
      currency: mapCurrency(data.currency),
      status: mapStatus(data.status),
      tokenId: Number(data.tokenId ?? 0),
      artist: data.artist ? getAddress(data.artist) : "0x0000000000000000000000000000000000000000",
      createdAt: Number(data.createdAt ?? 0),
    });
  }
  return items;
}

export async function buildCreateCommissionTx(
  _buyerPublicKey: string,
  intention: string,
  referenceImage: string,
  priceAvax: bigint,
  priceUsdc: bigint,
  avaxUsdcRate: bigint,
  currency: CommissionCurrency,
): Promise<string> {
  return encodeTxRequest({
    kind: "contract",
    contract: "commission",
    functionName: "createCommission",
    args: [intention, referenceImage, priceAvax.toString(), priceUsdc.toString(), avaxUsdcRate.toString(), currency === "Usdc" ? 1 : 0],
    value: currency === "Usdc" ? undefined : priceAvax.toString(),
  });
}

export async function buildMarkDeliveredTx(_artistPublicKey: string, commissionId: number) {
  return encodeTxRequest({ kind: "contract", contract: "commission", functionName: "markDelivered", args: [BigInt(commissionId).toString()] });
}

export async function buildApproveDeliveryTx(_buyerPublicKey: string, commissionId: number) {
  return encodeTxRequest({ kind: "contract", contract: "commission", functionName: "approveDelivery", args: [BigInt(commissionId).toString()] });
}

export async function buildCancelCommissionTx(_callerPublicKey: string, commissionId: number) {
  return encodeTxRequest({ kind: "contract", contract: "commission", functionName: "cancelCommission", args: [BigInt(commissionId).toString()] });
}
