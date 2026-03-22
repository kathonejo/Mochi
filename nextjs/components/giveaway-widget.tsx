"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "./language-provider";

export function GiveawayWidget() {
  const { isSpanish } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const handleGoToAuction = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      router.push("/marketplace");
    });
  };

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      setIsOpen(true);
    }, 3000);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 right-4 z-[60] flex items-end gap-2"
    >
      <div
        id="giveaway-panel"
        className={`origin-right overflow-hidden transition-all duration-300 ease-out ${
          isOpen
            ? "pointer-events-auto w-[min(78vw,18rem)] md:w-[min(70vw,24rem)] lg:w-[min(60vw,26rem)] max-w-[calc(100vw-5rem)] opacity-100 translate-x-0"
            : "pointer-events-none w-0 opacity-0 translate-x-3"
        }`}
      >
        <div className="rounded-2xl giveaway-border p-[2px] shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
          <div className="relative rounded-[calc(1rem-2px)] bg-[#0b0f14] text-white p-3 md:p-4 border border-white/10">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-5 top-5 text-xs font-bold text-white/80 hover:text-white"
              aria-label={isSpanish ? "Cerrar popup" : "Close popup"}
            >
              ×
            </button>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.14em] text-[var(--brand-accent)]">
              {isSpanish ? "Mercado Testnet" : "Testnet Marketplace"}
            </p>
            <p className="mt-1 text-sm md:text-base font-black leading-tight break-words">
              {isSpanish ? "Primer mochi en subasta." : "First mochi is live."}
            </p>
            <p className="mt-1 text-xs md:text-sm leading-snug text-white/90 break-words">
              {isSpanish
                ? "Oferta con AVAX o USDC en Avalanche Fuji."
                : "Bid with AVAX or USDC on Avalanche Fuji."}
            </p>
            <button
              type="button"
              onClick={handleGoToAuction}
              className="mt-3 inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold neural-button"
            >
              {isSpanish ? "Ir al mercado" : "Go to marketplace"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .giveaway-border {
          background-size: 300% 300%;
          animation: gradient_301 6s ease infinite;
          background-image: linear-gradient(
            137.48deg,
            rgba(134, 240, 255, 0.35) 10%,
            rgba(255, 255, 255, 0.1) 45%,
            rgba(134, 240, 255, 0.35) 87%
          );
        }

        @keyframes gradient_301 {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>
    </div>
  );
}
