"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./language-provider";

type MochiCharacterProps = {
  mirror?: boolean;
};

export function MochiCharacter({ mirror = false }: MochiCharacterProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isJumping, setIsJumping] = useState(false);
  const { isSpanish } = useLanguage();

  useEffect(() => {
    const interval = setInterval(() => {
      setIsJumping(true);
      setTimeout(() => setIsJumping(false), 400);

      setPosition({
        x: Math.random() * 10 - 5,
        y: Math.random() * 5 - 2.5,
      });
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="relative transition-all duration-500 ease-out"
      style={{
        transform: [
          `translate(${position.x}px, ${position.y}px)`,
          isJumping ? "translateY(-30px)" : "",
          mirror ? "scaleX(-1)" : "",
        ]
          .filter(Boolean)
          .join(" "),
      }}
    >
      <div className="relative">
        {/* Main character image */}
        <img
          src="/bunny-hero.png"
          alt={isSpanish ? "Icono del conejo Mochi" : "Mochi bunny icon"}
          className="w-60 h-60 sm:w-72 sm:h-72 md:w-80 md:h-80 lg:w-[26rem] lg:h-[26rem] object-contain drop-shadow-2xl"
        />

        {/* Floating sparkles on jump */}
        {isJumping && (
          <div className="absolute inset-0 pointer-events-none">
            <span className="absolute top-1/4 left-0 text-xl animate-ping">
              ✦
            </span>
            <span className="absolute top-1/3 right-0 text-lg animate-ping animation-delay-100">
              ✦
            </span>
            <span className="absolute bottom-1/3 left-1/4 text-sm animate-ping animation-delay-200">
              ✦
            </span>
          </div>
        )}

        {/* Platform shadow */}
        {/* <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-4 bg-foreground/10 rounded-full blur-sm" /> */}
      </div>
    </div>
  );
}
