"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "./language-provider";

const TWITTER_USERNAME_REGEX = /^@?[A-Za-z0-9_]{1,15}$/;

type FeedbackStatus =
  | { type: "idle"; message: string }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export function SubscribeSection() {
  const { isSpanish } = useLanguage();
  const [feedback, setFeedback] = useState("");
  const [twitterUsername, setTwitterUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>({
    type: "idle",
    message: "",
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanFeedback = feedback.trim();
    const cleanTwitterUsername = twitterUsername.trim();

    if (cleanFeedback.length < 8) {
      setStatus({
        type: "error",
        message: isSpanish
          ? "Por favor comparte al menos un comentario corto."
          : "Please share at least a short comment.",
      });
      return;
    }

    if (
      cleanTwitterUsername &&
      !TWITTER_USERNAME_REGEX.test(cleanTwitterUsername)
    ) {
      setStatus({
        type: "error",
        message: isSpanish
          ? "Ingresa un usuario válido de X o déjalo vacío."
          : "Please enter a valid X username or leave it empty.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatus({ type: "idle", message: "" });

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: cleanFeedback,
          twitterUsername: cleanTwitterUsername || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus({
          type: "error",
          message:
            payload.error ||
            (isSpanish
              ? "No se pudo enviar el feedback ahora."
              : "Could not send feedback right now."),
        });
        return;
      }

      setFeedback("");
      setTwitterUsername("");
      setStatus({
        type: "success",
        message: isSpanish
          ? "¡Gracias! Tu feedback fue enviado."
          : "Thanks! Your feedback was sent.",
      });
    } catch (error) {
      console.error("Feedback submit error:", error);
      setStatus({
        type: "error",
        message: isSpanish
          ? "No se pudo enviar el feedback ahora."
          : "Could not send feedback right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section id="subscribe" className="py-12 md:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Follow on X removed: button moved next to feedback submit */}

        {/* Feedback form */}
        <div className="neural-card rounded-3xl p-6 md:p-8 border border-white/10">
          <h3 className="text-2xl font-bold text-foreground mb-2">
            {isSpanish
              ? "¿Qué te parece Mochi?"
              : "What do you think about Mochi?"}
          </h3>
          

          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={isSpanish ? "Comparte tu opinión..." : "Share your thoughts..."}
              className="w-full min-h-28 rounded-2xl border border-white/10 bg-[#0b0f14] p-4 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
              maxLength={1500}
              required
            />

            <input
              type="text"
              value={twitterUsername}
              onChange={(event) => setTwitterUsername(event.target.value)}
              placeholder={
                isSpanish
                  ? "(opcional) Usuario de X ej: @tuusuario"
                  : "(optional) X username e.g. @yourhandle"
              }
              className="w-full rounded-xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
            />

            <div className="flex justify-between items-center gap-3">
              <a
                href="https://x.com/MochiAgents"
                target="_blank"
                rel="noopener noreferrer"
                className="neural-button rounded-xl px-6 py-3 text-base font-semibold inline-flex items-center gap-2 bg-[#1d9bf0] text-white hover:bg-[#1483d6]"
                aria-label={isSpanish ? "Seguinos en X" : "Follow us on X"}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                {isSpanish ? "Seguinos en X" : "Follow us on X"}
              </a>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="neural-button rounded-xl px-6 py-6 text-base font-semibold inline-flex items-center gap-2"
              >
                {isSubmitting
                  ? isSpanish
                    ? "Enviando..."
                    : "Sending..."
                  : isSpanish
                    ? "Enviar feedback"
                    : "Send Feedback"}
              </Button>
            </div>
          </form>

          {status.message ? (
            <p
              className={`mt-4 text-sm ${
                status.type === "success" ? "text-green-700" : "text-red-700"
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
