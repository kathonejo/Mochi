"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, Home } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export default function SubscriptionSuccessPage() {
  const { isSpanish } = useLanguage();
  const searchParams = useSearchParams();
  const already = searchParams.get("already") === "true";

  const typeMessagesEn: Record<string, string> = {
    updates: "project updates and new features",
    mochi_request: "mochi availability notifications",
    collection_request: "new collection announcements",
  };

  const typeMessagesEs: Record<string, string> = {
    updates: "novedades del proyecto y nuevas funciones",
    mochi_request: "avisos de disponibilidad de mochis",
    collection_request: "anuncios de nuevas colecciones",
  };

  const type = searchParams.get("type") ?? "";
  const message = type
    ? (isSpanish ? typeMessagesEs[type] : typeMessagesEn[type]) || (isSpanish ? "novedades" : "updates")
    : (isSpanish ? "novedades" : "updates");

  return (
    <main className="min-h-screen neural-shell flex items-center justify-center p-4">
      <div className="neural-card rounded-3xl max-w-md w-full p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 border border-white/10 mb-6 text-[var(--brand-accent)]">
          <CheckCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          {already
            ? (isSpanish ? "¡Ya estaba confirmado!" : "Already Confirmed!")
            : (isSpanish ? "¡Suscripción confirmada!" : "You're Subscribed!")}
        </h1>

        <p className="text-muted-foreground mb-6">
          {already
            ? (isSpanish
              ? `Tu email ya estaba confirmado. Vas a recibir ${message} de Mochi.`
              : `Your email was already confirmed. You'll receive ${message} from Mochi.`)
            : (isSpanish
              ? `¡Gracias por confirmar! Ahora vas a recibir ${message} de Mochi.`
              : `Thanks for confirming! You'll now receive ${message} from Mochi.`)}
        </p>

        <Link href="/">
          <Button className="neural-button rounded-xl px-6">
            <Home className="w-4 h-4 mr-2" />
            {isSpanish ? "Volver al inicio" : "Back to Home"}
          </Button>
        </Link>
      </div>
    </main>
  );
}
