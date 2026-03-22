export type ContractKey = "nft" | "editions" | "auction" | "marketplace" | "swap" | "commission";

export type ContractTxRequest = {
  kind: "contract";
  contract: ContractKey;
  functionName: string;
  args?: unknown[];
  value?: string;
};

export type ParsedContractTxRequest = {
  kind: "contract";
  contract: ContractKey;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};

export function encodeTxRequest(request: ContractTxRequest): string {
  return JSON.stringify(request);
}

export function decodeTxRequest(serialized: string): ParsedContractTxRequest {
  const parsed = JSON.parse(serialized) as ContractTxRequest;
  if (!parsed || parsed.kind !== "contract" || !parsed.contract || !parsed.functionName) {
    throw new Error("Invalid transaction request");
  }
  return {
    kind: "contract",
    contract: parsed.contract,
    functionName: parsed.functionName,
    args: Array.isArray(parsed.args) ? parsed.args : [],
    value: parsed.value ? BigInt(parsed.value) : undefined,
  };
}
