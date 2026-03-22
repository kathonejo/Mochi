import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const DEFAULT_ELEVENLABS_MODEL_ID =
  process.env.ELEVENLABS_DEFAULT_TTS_MODEL || "eleven_flash_v2_5";

function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 1200);
}

function sanitizeToken(input: unknown, maxLength = 600): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function sanitizeVoiceId(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_ELEVENLABS_VOICE_ID;
  const cleaned = input.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  return cleaned || DEFAULT_ELEVENLABS_VOICE_ID;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const provider = body.provider === "elevenlabs" ? "elevenlabs" : "unsupported";
    if (provider !== "elevenlabs") {
      return NextResponse.json({ error: "Unsupported TTS provider" }, { status: 400 });
    }

    const text = sanitizeText(body.text);
    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = sanitizeToken(body.elevenlabsApiKey, 600);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ElevenLabs API key" }, { status: 400 });
    }

    const voiceId = sanitizeVoiceId(body.voiceId);
    const modelId = sanitizeToken(body.modelId, 120) || DEFAULT_ELEVENLABS_MODEL_ID;

    const upstream = await fetch(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: "ELEVENLABS_REQUEST_FAILED",
          status: upstream.status,
          details: details.slice(0, 600),
        },
        { status: 502 },
      );
    }

    const audioBuffer = await upstream.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
