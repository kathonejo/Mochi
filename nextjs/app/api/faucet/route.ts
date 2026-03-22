import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, getAddress, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localAvalancheChain } from "@/lib/contracts";

function normalizeNetwork(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "local" || normalized === "localhost" || normalized === "dev" || normalized === "development") {
    return "local";
  }
  if (normalized === "fuji" || normalized === "testnet" || normalized === "test") {
    return "fuji";
  }
  if (normalized === "mainnet" || normalized === "main" || normalized === "cchain" || normalized === "public") {
    return "mainnet";
  }
  return normalized;
}

function isLocalNetwork() {
  return normalizeNetwork(process.env.NEXT_PUBLIC_NETWORK ?? "") === "local";
}

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_RPC_URL?.trim() || "http://127.0.0.1:8545";
}

function getDeployerAccount() {
  const privateKey =
    process.env.LOCAL_DEPLOYER_PRIVATE_KEY?.trim() ||
    process.env.ANVIL_DEFAULT_PRIVATE_KEY?.trim() ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  return privateKeyToAccount(privateKey as `0x${string}`);
}

async function fundLocalAvaxAndUsdc(address: `0x${string}`) {
  const rpcUrl = getRpcUrl();
  const account = getDeployerAccount();
  const walletClient = createWalletClient({
    account,
    chain: localAvalancheChain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: localAvalancheChain,
    transport: http(rpcUrl),
  });

  const avaxAmount = process.env.LOCAL_AVAX_FAUCET_AMOUNT?.trim() || "25";
  const usdcAmountRaw = process.env.LOCAL_USDC_FAUCET_AMOUNT?.trim() || "500";
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS?.trim();

  const avaxHash = await walletClient.sendTransaction({
    account,
    to: address,
    value: parseEther(avaxAmount),
  });
  await publicClient.waitForTransactionReceipt({ hash: avaxHash });

  let usdcFunded = false;
  let usdcSkipped = true;
  let usdcHash: `0x${string}` | null = null;

  if (usdcAddress) {
    usdcSkipped = false;
    usdcHash = await walletClient.writeContract({
      account,
      address: getAddress(usdcAddress),
      abi: parseAbi(["function mint(address to, uint256 amount) external"]),
      functionName: "mint",
      args: [address, BigInt(Math.round(Number(usdcAmountRaw) * 1_000_000))],
    });
    await publicClient.waitForTransactionReceipt({ hash: usdcHash });
    usdcFunded = true;
  }

  return {
    avaxFunded: true,
    usdcFunded,
    usdcSkipped,
    avaxTxHash: avaxHash,
    usdcTxHash: usdcHash,
  };
}

export async function POST(request: Request) {
  try {
    if (!isLocalNetwork()) {
      return NextResponse.json(
        { error: "Faucet is only supported for local Anvil networks." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { address?: string };
    let address: `0x${string}`;
    try {
      address = getAddress((body.address ?? "").trim());
    } catch {
      return NextResponse.json({ error: "Invalid EVM wallet address." }, { status: 400 });
    }

    const result = await fundLocalAvaxAndUsdc(address);

    return NextResponse.json({
      network: "local",
      avaxFunded: result.avaxFunded,
      usdcFunded: result.usdcFunded,
      usdcSkipped: result.usdcSkipped,
      avaxTxHash: result.avaxTxHash,
      usdcTxHash: result.usdcTxHash,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not fund wallet from faucet.",
      },
      { status: 500 }
    );
  }
}
