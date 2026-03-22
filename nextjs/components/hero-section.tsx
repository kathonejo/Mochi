"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wand2 } from "lucide-react";
import { MochiCharacter } from "./mochi-character";
import { Link as ScrollLink } from "react-scroll";
import { SparkleAnimation } from "./sparkle-animation";
import { useLanguage } from "./language-provider";

export function HeroSection() {
  const { isSpanish } = useLanguage();
  const [isHowItWorksHovered, setIsHowItWorksHovered] = useState(false);
  const [isViewCollectionHovered, setIsViewCollectionHovered] = useState(false);

  return (
    <section className="relative neural-hero min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 overflow-hidden pt-24">
      <div className="max-w-7xl mx-auto w-full">
        <div className="relative flex w-full flex-col items-center text-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-12">
          {/* Left content (h1, info cards, CTA) */}
          <div className="flex max-w-3xl flex-col items-center text-center">
            {/* Large background typography */}
            <h1 className="text-[11vw] sm:text-[9vw] lg:text-[6.5vw] font-semibold leading-none tracking-tight text-balance">
              {isSpanish ? "Sistema de Mascotas IA" : "AI pets system"}
            </h1>

            {/* Info cards */}
            <div className="mt-8 flex w-full justify-center">
              <div className="max-w-xl text-center">
                <p className="text-lg leading-relaxed text-muted-foreground">
                  {isSpanish ? (
                    <>
                      Mascotas animadas para tu navegador: chatean con IA con OpenRouter u Ollama, despiertan como
                      agentes OpenClaw para hacer tareas online y onchain, y su apariencia es personalizable con NFTs
                      únicos.{" "}
                      <Link href="/download" prefetch={false} className="underline font-medium">
                        Pruébalas gratis
                      </Link>
                    </>
                  ) : (
                    <>
                      Animated pets for your browser that chat through Ollama/OpenRouter or awaken as OpenClaw
                      agents to handle online and onchain errands. Their appearance is customizable with unique NFTs.{" "}
                      <Link href="/download" prefetch={false} className="underline font-medium">
                        Try them for free
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-12 flex flex-row flex-wrap justify-center gap-3">
              <div
                className="relative"
                onMouseEnter={() => setIsHowItWorksHovered(true)}
                onMouseLeave={() => setIsHowItWorksHovered(false)}
              >
                <ScrollLink to="get-started" smooth={true} duration={1500}>
                  <Button
                    size="lg"
                    className="neural-button rounded-full hover:cursor-pointer px-8 gap-2 text-base"
                  >
                    {isSpanish ? "Cómo funciona" : "How it works"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </ScrollLink>
                <SparkleAnimation isHovering={isHowItWorksHovered} />
              </div>
              <div
                className="relative"
                onMouseEnter={() => setIsViewCollectionHovered(true)}
                onMouseLeave={() => setIsViewCollectionHovered(false)}
              >
                <Button
                  asChild
                  size="lg"
                  className="neural-button-outline rounded-full hover:cursor-pointer px-8 gap-2 text-base"
                >
                  <Link href="/marketplace">
                    <Wand2 className="w-4 h-4" />
                    {isSpanish ? "Ver Mercado" : "View Marketplace"}
                  </Link>
                </Button>
                <SparkleAnimation isHovering={isViewCollectionHovered} />
              </div>
            </div>
          </div>

          {/* Right content (MochiCharacter) */}
          <div className="relative">
            <div className="relative">
              <div className="absolute inset-x-0 -bottom-6 mx-auto h-16 w-52 rounded-2xl neural-outline bg-white/5 blur-[2px]" />
              <MochiCharacter mirror />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
