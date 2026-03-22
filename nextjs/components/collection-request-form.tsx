"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmailSubscribeModal } from "@/components/email-subscribe-modal";
import { Bell, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function CollectionRequestForm() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isSpanish } = useLanguage();

  return (
    <div className="neural-card rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-[var(--brand-accent)]">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold mb-2">
            {isSpanish ? "Pedidos de Mochi personalizados" : "Custom Mochi Requests"}
          </h2>
          <p className="text-gray-700 text-sm mb-4">
            {isSpanish
              ? "Pronto vas a poder pedir rasgos y comportamientos personalizados para nuevos mochis. Suscribite para enterarte cuando se active."
              : "Soon you'll be able to request custom traits and behaviors for new mochis. Subscribe to get notified when this feature launches!"}
          </p>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="neural-button rounded-xl px-6"
          >
            <Bell className="w-4 h-4 mr-2" />
            {isSpanish ? "Avisame cuando esté disponible" : "Notify Me When Available"}
          </Button>
        </div>
      </div>

      <EmailSubscribeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type="collection_request"
        title={isSpanish ? "¡Próximamente!" : "Coming Soon!"}
        subtitle={isSpanish ? "Te avisamos cuando abran los pedidos personalizados" : "We'll notify you when custom requests open"}
        buttonText={isSpanish ? "Avisame" : "Notify Me"}
      />
    </div>
  );
}
