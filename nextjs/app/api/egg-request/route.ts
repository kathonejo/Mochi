import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

const EGG_REQUEST_TO_EMAIL =
  process.env.EGG_REQUEST_TO_EMAIL || "dev.mochi@gmail.com";

interface EggRequestPayload {
  email?: string;
  wallet?: string;
  intention?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EggRequestPayload;
    const email = (body.email || "").trim();
    const wallet = (body.wallet || "").trim();
    const intention = (body.intention || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please provide a valid email." },
        { status: 400 },
      );
    }

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet is required." },
        { status: 400 },
      );
    }

    const resend = getResend();
    if (!resend) {
      return NextResponse.json(
        { error: "Email service not configured." },
        { status: 500 },
      );
    }

    const safeEmail = escapeHtml(email);
    const safeWallet = escapeHtml(wallet);
    const safeIntention = escapeHtml(intention || "None");

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Mochi <noreply@mochi.dev>",
      to: EGG_REQUEST_TO_EMAIL,
      subject: "New Mochi Egg Request",
      text: `New egg request\n\nEmail: ${email}\nWallet: ${wallet}\nIntention: ${intention || "None"}`,
      html: `
        <h2>New egg request</h2>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Wallet:</strong> ${safeWallet}</p>
        <p><strong>Intention:</strong></p>
        <p>${safeIntention.replaceAll("\n", "<br />")}</p>
      `,
    });

    if (error) {
      console.error("Resend egg request error:", error);
      return NextResponse.json(
        { error: "Failed to send request." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Egg request API error:", error);
    return NextResponse.json(
      { error: "Failed to process request." },
      { status: 500 },
    );
  }
}
