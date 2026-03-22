import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import { createHmac } from "crypto";

// Token expires after 24 hours
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface TokenData {
  email: string;
  type: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

function getSigningSecret() {
  const secret = process.env.SUBSCRIBE_SIGNING_SECRET || process.env.RESEND_API_KEY;
  if (!secret) {
    return null;
  }
  return secret;
}

function verifyAndDecodeToken(token: string): TokenData | null {
  try {
    const secret = getSigningSecret();
    if (!secret) return null;
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    const { data, signature } = decoded;

    // Verify signature
    const expectedSignature = createHmac("sha256", secret).update(data).digest("hex");
    if (signature !== expectedSignature) {
      return null;
    }

    const parsed: TokenData = JSON.parse(data);

    // Check expiry
    if (Date.now() - parsed.timestamp > TOKEN_EXPIRY_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/subscription/error?reason=missing-token", request.url)
    );
  }

  // Verify and decode the token
  const tokenData = verifyAndDecodeToken(token);

  if (!tokenData) {
    return NextResponse.redirect(
      new URL("/subscription/error?reason=invalid-token", request.url)
    );
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.redirect(
      new URL("/subscription/error?reason=service-error", request.url)
    );
  }

  // Get the audience ID for this subscription type
  const audienceIds: Record<string, string | undefined> = {
    updates: process.env.RESEND_AUDIENCE_UPDATES,
    mochi_request: process.env.RESEND_AUDIENCE_MOCHI,
    collection_request: process.env.RESEND_AUDIENCE_COLLECTION,
  };

  const audienceId = audienceIds[tokenData.type];

  // If no audience ID configured, log warning but still confirm subscription
  if (!audienceId) {
    console.warn(`No audience ID configured for type: ${tokenData.type} - skipping audience add`);
    return NextResponse.redirect(
      new URL(`/subscription/success?type=${tokenData.type}`, request.url)
    );
  }

  try {
    console.log(`Attempting to add contact: ${tokenData.email} to audience: ${audienceId}`);
    // Add contact to Resend Audience
    const { data, error } = await resend.contacts.create({
      email: tokenData.email,
      audienceId: audienceId,
      unsubscribed: false,
    });

    if (error) {
      // Check if contact already exists
      const resendErrorName = typeof error.name === "string" ? error.name : String(error.name ?? "");
      const resendErrorMessage =
        typeof error.message === "string" ? error.message : String(error.message ?? "");
      if (
        resendErrorName === "contact_already_exists" ||
        (error.statusCode === 409 && resendErrorMessage.includes("already exists"))
      ) {
        console.log('Contact already exists, redirecting to success.');
        return NextResponse.redirect(
          new URL(`/subscription/success?type=${tokenData.type}&already=true`, request.url)
        );
      }
      
      console.error("Resend contact create error:", error);
      // Still show success for demo - contact confirmed even if audience add failed
      return NextResponse.redirect(
        new URL(`/subscription/success?type=${tokenData.type}`, request.url)
      );
    }

    console.log("Successfully added contact:", data);

    return NextResponse.redirect(
      new URL(`/subscription/success?type=${tokenData.type}`, request.url)
    );
  } catch (error: unknown) {
    console.error("Full error object when adding contact:", JSON.stringify(error, null, 2));
    // Still show success for demo - contact confirmed even if audience add failed
    return NextResponse.redirect(
      new URL(`/subscription/success?type=${tokenData.type}`, request.url)
    );
  }
}
