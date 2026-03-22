import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";
import {
  getConfirmationEmailHtml,
  getConfirmationEmailText,
} from "@/lib/email-templates";
import { createHmac } from "crypto";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscriptionType = "updates" | "mochi_request" | "collection_request";

interface SubscribeRequest {
  email: string;
  type: SubscriptionType;
  metadata?: Record<string, unknown>;
}

function getSigningSecret() {
  const secret = process.env.SUBSCRIBE_SIGNING_SECRET || process.env.RESEND_API_KEY;
  if (!secret) {
    throw new Error("Missing signing secret");
  }
  return secret;
}

// Create a signed token to prevent tampering
function createSignedToken(email: string, type: string, metadata?: Record<string, unknown>): string {
  const secret = getSigningSecret();
  const data = JSON.stringify({ email, type, metadata, timestamp: Date.now() });
  const signature = createHmac("sha256", secret).update(data).digest("hex");
  const token = Buffer.from(JSON.stringify({ data, signature })).toString("base64url");
  return token;
}

export async function POST(request: NextRequest) {
  try {
    const body: SubscribeRequest = await request.json();
    const { email, type, metadata = {} } = body;

    // Validate email
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes: SubscriptionType[] = [
      "updates",
      "mochi_request",
      "collection_request",
    ];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid subscription type" },
        { status: 400 }
      );
    }

    // Get Resend client
    const resend = getResend();
    if (!resend) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Create signed token with email, type, and metadata
    const token = createSignedToken(normalizedEmail, type, metadata);

    // Build confirmation URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://mochi.dev";
    const confirmationUrl = `${baseUrl}/api/confirm?token=${token}`;

    // Send confirmation email
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Mochi <noreply@mochi.dev>",
      replyTo: "kathonejo@gmail.com",
      to: normalizedEmail,
      subject: "Confirm your subscription to Mochi",
      html: getConfirmationEmailHtml({ confirmationUrl, type }),
      text: getConfirmationEmailText({ confirmationUrl, type }),
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json(
        { error: "Failed to send confirmation email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Check your email to confirm your subscription!",
      requiresConfirmation: true,
    });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to process subscription" },
      { status: 500 }
    );
  }
}
