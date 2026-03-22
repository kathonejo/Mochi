"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLanguage } from "./language-provider";

const TWITTER_USERNAME_REGEX = /^@?[A-Za-z0-9_]{1,15}$/;

type FeedbackStatus =
  | { type: "idle"; message: string }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export function ProjectFeedbackBox() {
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
        headers: {
          "Content-Type": "application/json",
        },
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
    <div id="feedback-form-section" className="mt-10 md:mt-12">
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
                ? "Usuario de X (opcional) ej: @tuusuario"
                : "X username (optional) e.g. @yourhandle"
            }
            className="w-full rounded-xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
          />

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {isSpanish
                ? "Si el usuario de X está vacío, el feedback es anónimo y no participa del giveaway. Recuerda seguir a @MochiAgents en X."
                : "If X username is empty, feedback is anonymous and not eligible for the giveaway draw. Also remember to follow @MochiAgents on X."}
            </p>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="neural-button rounded-xl px-6"
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
  );
}
