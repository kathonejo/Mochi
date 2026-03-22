"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export default function SubscriptionErrorPage() {
  const { isSpanish } = useLanguage();
  const searchParams = useSearchParams();

  const errorMessagesEn: Record<string, { title: string; message: string }> = {
    "missing-token": {
      title: "Invalid Link",
      message: "The confirmation link appears to be incomplete. Please try clicking the link from your email again.",
    },
    "invalid-token": {
      title: "Link Not Found",
      message: "This confirmation link is invalid or has already been used. If you need to subscribe again, please visit our website.",
    },
    "expired-token": {
      title: "Link Expired",
      message: "This confirmation link has expired. Please subscribe again to receive a new confirmation email.",
    },
    "service-error": {
      title: "Service Unavailable",
      message: "We're having trouble processing your request. Please try again later.",
    },
    "update-failed": {
      title: "Something Went Wrong",
      message: "We couldn't confirm your subscription. Please try again or contact support if the problem persists.",
    },
  };

  const errorMessagesEs: Record<string, { title: string; message: string }> = {
    "missing-token": {
      title: "Link inválido",
      message: "El link de confirmación está incompleto. Probá abrir el link desde tu email otra vez.",
    },
    "invalid-token": {
      title: "Link no encontrado",
      message: "Este link es inválido o ya fue usado. Si necesitás suscribirte de nuevo, visitá nuestro sitio.",
    },
    "expired-token": {
      title: "Link expirado",
      message: "Este link expiró. Suscribite de nuevo para recibir un nuevo email de confirmación.",
    },
    "service-error": {
      title: "Servicio no disponible",
      message: "Tuvimos un problema procesando tu solicitud. Intentá más tarde.",
    },
    "update-failed": {
      title: "Algo salió mal",
      message: "No pudimos confirmar tu suscripción. Probá de nuevo o contactanos si el problema persiste.",
    },
  };

  const error = (isSpanish ? errorMessagesEs : errorMessagesEn)[searchParams.get("reason") ?? ""] || {
    title: isSpanish ? "Algo salió mal" : "Something Went Wrong",
    message: isSpanish ? "Ocurrió un error inesperado. Probá de nuevo." : "An unexpected error occurred. Please try again.",
  };

  return (
    <main className="min-h-screen neural-shell flex items-center justify-center p-4">
      <div className="neural-card rounded-3xl max-w-md w-full p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 border border-white/10 mb-6 text-red-400">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          {error.title}
        </h1>

        <p className="text-muted-foreground mb-6">{error.message}</p>

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
