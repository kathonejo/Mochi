import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PNG, JPEG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      return NextResponse.json(
        { error: "Pinata not configured" },
        { status: 500 }
      );
    }

    // Create form data for Pinata
    const pinataFormData = new FormData();
    pinataFormData.append("file", file);

    // Add metadata
    const metadata = JSON.stringify({
      name: `Mochi Commission - ${file.name}`,
      keyvalues: {
        description: description || "",
        timestamp: new Date().toISOString(),
        originalName: file.name,
        fileType: file.type,
      },
    });
    pinataFormData.append("pinataMetadata", metadata);

    // Upload to Pinata
    const pinataResponse = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pinataJwt}`,
        },
        body: pinataFormData,
      }
    );

    if (!pinataResponse.ok) {
      const error = await pinataResponse.text();
      console.error("Pinata error:", error);
      return NextResponse.json(
        { error: "Failed to upload to IPFS" },
        { status: 500 }
      );
    }

    const pinataData = await pinataResponse.json();

    return NextResponse.json({
      success: true,
      ipfsHash: pinataData.IpfsHash,
      ipfsUrl: `https://gateway.pinata.cloud/ipfs/${pinataData.IpfsHash}`,
      url: `https://gateway.pinata.cloud/ipfs/${pinataData.IpfsHash}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    );
  }
}
