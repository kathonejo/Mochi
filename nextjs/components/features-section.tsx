"use client";

import {
  MessageSquare, Bot, Sparkles,
  Heart, Wand2, Star,
  Flower2, Candy, Cloud,
  type LucideIcon,
} from "lucide-react";
import { ScrollAnimation } from "./scroll-animation";
import { useLanguage } from "./language-provider";
import { useCurrentTheme, type SiteTheme } from "@/hooks/use-current-theme";

const themeIcons: Record<SiteTheme, [LucideIcon, LucideIcon, LucideIcon]> = {
  neural:  [MessageSquare, Bot, Sparkles],
  "black-pink": [Heart, Wand2, Star],
  kawaii:  [Heart, Wand2, Sparkles],
  pastel:  [Flower2, Candy, Cloud],
};

const features = [
  {
    titleEn: "Always-on AI assistant",
    titleEs: "Asistente de IA siempre disponible",
    descriptionEn:
      "Ask questions, get answers, brainstorm, and have real conversations — powered by your own OpenRouter or Ollama.",
    descriptionEs:
      "Hacé preguntas, conseguí respuestas y conversá en profundidad — con tu propio OpenRouter u Ollama.",
  },
  {
    titleEn: "Onchain-native AI brain",
    titleEs: "Cerebro AI nativo onchain",
    descriptionEn:
      "Bitte AI is a provider that reasons about wallets, tokens, and transactions — ask your Mochi to swap, check balances, or call contracts. Agent mode via OpenClaw goes even further with full tool access.",
    descriptionEs:
      "Bitte AI es un proveedor que razona sobre wallets, tokens y transacciones — pedile a tu Mochi que haga swaps, consulte balances o llame contratos. El modo agente via OpenClaw va aún más lejos con acceso completo a herramientas.",
  },
  {
    titleEn: "Built for vibecoding",
    titleEs: "Ideal para vibecodear",
    descriptionEn:
      "Perfect for vibecoding sessions. The desktop app includes a built-in terminal so your Mochi can help you run commands and automate workflows.",
    descriptionEs:
      "Ideal para sesiones de vibecodeo. La app de escritorio incluye un terminal integrado para que tu Mochi te ayude a ejecutar comandos y automatizar flujos de trabajo.",
  },
];

export function FeaturesSection() {
  const { isSpanish } = useLanguage();
  const theme = useCurrentTheme();
  const icons = themeIcons[theme];
  const variants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
  };

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
      <ScrollAnimation variants={variants}>
        <div className="w-full mx-auto">
          <div className="text-center mb-16">
            
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-foreground tracking-tight">
              {isSpanish ? "Tu asistente de IA personal" : "Your personal AI assistant"}
            </h2>
            <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
              {isSpanish
                ? "Habla, actúa y opera de forma autónoma — y además camina por tu pantalla"
                : "Talks, acts, and operates autonomously — and also walks across your screen"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, idx) => {
              const Icon = icons[idx];
              return (
              <div
                key={feature.titleEn}
                className="group neural-card rounded-3xl p-8 transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 bg-foreground/5 border border-foreground/10 rounded-2xl flex items-center justify-center mb-6 transition-colors text-[var(--brand-accent)]">
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {isSpanish ? feature.titleEs : feature.titleEn}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {isSpanish ? feature.descriptionEs : feature.descriptionEn}
                </p>
              </div>
              );
            })}
          </div>
        </div>
      </ScrollAnimation>
    </section>
  );
}
