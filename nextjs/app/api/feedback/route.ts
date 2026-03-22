import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/resend";

const TWITTER_USERNAME_REGEX = /^@?[A-Za-z0-9_]{1,15}$/;
const FEEDBACK_TO_EMAIL = process.env.FEEDBACK_TO_EMAIL || "dev.mochi@gmail.com";

interface FeedbackRequest {
  feedback?: string;
  twitterUsername?: string;
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
    const body = (await request.json()) as FeedbackRequest;
    const feedback = body.feedback?.trim() || "";
    const twitterUsername = body.twitterUsername?.trim() || "";

    if (feedback.length < 8) {
      return NextResponse.json(
        { error: "Please provide a bit more feedback." },
        { status: 400 },
      );
    }

    if (feedback.length > 1500) {
      return NextResponse.json(
        { error: "Feedback is too long." },
        { status: 400 },
      );
    }

    if (twitterUsername && !TWITTER_USERNAME_REGEX.test(twitterUsername)) {
      return NextResponse.json(
        { error: "Invalid X username format." },
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

    const normalizedTwitterUsername = twitterUsername
      ? twitterUsername.replace(/^@/, "").toLowerCase()
      : "";
    const senderLabel = normalizedTwitterUsername
      ? `@${normalizedTwitterUsername}`
      : "Anonymous";
    const safeFeedback = escapeHtml(feedback);
    const safeTwitter = escapeHtml(senderLabel);

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Mochi <noreply@mochi.dev>",
      to: FEEDBACK_TO_EMAIL,
      subject: "New Mochi project feedback",
      text: `New feedback from website\n\nX username: ${senderLabel}\n\nFeedback:\n${feedback}`,
      html: `
        <h2>New feedback from website</h2>
        <p><strong>X username:</strong> ${safeTwitter}</p>
        <p><strong>Feedback:</strong></p>
        <p>${safeFeedback.replaceAll("\n", "<br />")}</p>
      `,
    });

    if (error) {
      console.error("Resend feedback error:", error);
      return NextResponse.json(
        { error: "Failed to send feedback." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Failed to process feedback." },
      { status: 500 },
    );
  }
}
