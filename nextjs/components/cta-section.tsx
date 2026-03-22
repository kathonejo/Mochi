"use client";

import DownloadButton from "./download-button";
import AuctionButton from "./auction-button";
import { ScrollAnimation } from "./scroll-animation";
import { useLanguage } from "./language-provider";

export function CtaSection() {
  const { isSpanish } = useLanguage();
  const variants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
  };

  return (
    <section id="cta" className="py-20 px-4 sm:px-6 lg:px-8">
      <ScrollAnimation variants={variants}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center rounded-3xl neural-card p-8 md:p-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4 tracking-tight text-balance text-foreground">
              {isSpanish
                ? "Tu mascota IA te espera"
                : "Your AI pet is waiting"}
            </h2>
            <p className="mb-4 max-w-lg mx-auto text-muted-foreground">
              {isSpanish
                ? "Descarga Mochi y conoce a tu Mochi que habla. O activa el modo agente para tareas online y onchain."
                : "Download Mochi and meet your talking Mochi. Or enable agent mode for online and onchain tasks."}
            </p>
            <p className="mb-8 max-w-lg mx-auto text-muted-foreground/80">
              {isSpanish
                ? "Mochi es libre de descargar y usar. Participá en la subasta para conseguir un Mochi NFT hecho a mano."
                : "Mochi is free download and use. Join the auction to get a handmade mochi."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <DownloadButton />
              <AuctionButton />
            </div>
          </div>
        </div>
      </ScrollAnimation>
    </section>
  );
}
