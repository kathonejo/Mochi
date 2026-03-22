"use client";

import {
  Download, Bot, Sparkles,
  Gift, Star, Crown,
  Flower2, Candy, Cloud,
  type LucideIcon,
} from "lucide-react";
import { ScrollAnimation } from "./scroll-animation";
import Link from "next/link";
import { useLanguage } from "./language-provider";
import { useCurrentTheme, type SiteTheme } from "@/hooks/use-current-theme";

const themeIcons: Record<SiteTheme, [LucideIcon, LucideIcon, LucideIcon]> = {
  neural:  [Download, Bot, Sparkles],
  "black-pink": [Gift, Star, Crown],
  kawaii:  [Gift, Star, Crown],
  pastel:  [Cloud, Flower2, Candy],
};

const steps = [
  {
    step: "01",
    titleEn: "Start in seconds",
    titleEs: "Empezá en segundos",
    descriptionEn: "Use it on the web, or install the browser extension or desktop app.",
    descriptionEs: "Usalo desde la web, o instalá la extensión para tu navegador o la app de escritorio.",
  },
  {
    step: "02",
    titleEn: "Awaken your companion",
    titleEs: "Despierta tu compañero",
    descriptionEn:
      "Configure the AI Brain and start chatting.",
    descriptionEs:
      "Configurá el Cerebro AI de tu Mochi y empezá a chatear.",
  },
  {
    step: "03",
    titleEn: "Make it truly yours",
    titleEs: "Hazlo verdaderamente tuyo",
    descriptionEn: "Explore the marketplace to discover and acquire different Mochi characters.",
    descriptionEs: "Explorá el marketplace para descubrir y adquirir diferentes personajes Mochi.",
  },
];

export function HowItWorksSection() {
  const { isSpanish } = useLanguage();
  const theme = useCurrentTheme();
  const icons = themeIcons[theme];
  const variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <section id="get-started" className="py-20 px-4 sm:px-6 lg:px-8">
      <ScrollAnimation variants={variants}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-foreground tracking-tight text-balance">
              {isSpanish ? "Tres pasos hacia tu nuevo compañero" : "Three steps to your new companion"}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, idx) => {
              const Icon = icons[idx];
              return (
              <div
                key={step.step}
                className="group relative neural-card rounded-3xl p-8 transition-all hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-8">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center border border-foreground/10 bg-foreground/5 text-[var(--brand-accent)]">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-5xl font-semibold text-foreground/15 transition-colors font-mono">
                    {step.step}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-foreground mb-3">
                  {isSpanish ? step.titleEs : step.titleEn}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {step.step === "01" ? (
                    isSpanish ? (
                      <>
                        Usalo desde la web, o{" "}
                        <Link
                          href="/download"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                          descargá
                        </Link>{" "}
                        la extensión para tu navegador o la app de escritorio.
                      </>
                    ) : (
                      <>
                        Use it on the web or <Link
                          href="/download"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                          download 
                        </Link>{" "}
                        the browser extension or desktop app.
                      </>
                    )
                  ) : step.step === "03" ? (
                    isSpanish ? (
                      <>
                        <Link
                          href="/marketplace"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                    Explorá el marketplace
                        </Link>
                         {" "}para descubrir y adquirir diferentes personajes Mochi.
        
                      </>
                    ) : (
                      <>
                        <Link
                          href="/marketplace"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                          Explore the marketplace
                        </Link>
    
    {" "}to discover and acquire different Mochi characters.
                      </>
                    )
                  ) : step.step === "02" ? (
                    isSpanish ? (
                      <>
                        {step.descriptionEs} {" "}
                        <Link
                          href="/help"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                          Centro de ayuda
                        </Link>
                      </>
                    ) : (
                      <>
                        {step.descriptionEn} {" "}
                        <Link
                          href="/help"
                          className="font-semibold underline decoration-2 underline-offset-2"
                        >
                          Help center
                        </Link>
                      </>
                    )
                  ) : (
                    isSpanish ? step.descriptionEs : step.descriptionEn
                  )}
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
