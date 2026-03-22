"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import Image from "next/image";
import { useLanguage } from "./language-provider";

export function Footer() {
  const { isSpanish } = useLanguage();
  return (
    <footer>
      {/* Footer Links */}
      <div className="border-t border-border bg-background/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-foreground/8 border border-border flex items-center justify-center">
                  <Image
                    src="/logo.png"
                    alt="Mochi Logo"
                    width={36}
                    height={36}
                  />
                </div>
                <span className="text-lg font-semibold text-foreground">
                  Mochi
                </span>
              </div>
             
              <div className="flex gap-3">
                <Link
                  href="https://x.com/MochiAgents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-2xl p-[2px] neural-outline transition-transform hover:-translate-y-0.5"
                  aria-label="X"
                >
                  <span className="flex h-full w-full items-center justify-center rounded-[0.9rem] bg-background text-[var(--brand-accent)]">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M18.244 2H21.5l-7.266 8.304L22.67 22h-6.59l-5.16-7.196L4.62 22H1.36l7.773-8.89L1.08 2h6.757l4.663 6.52L18.244 2Zm-1.144 18h1.83L6.78 3.896H4.814L17.1 20Z" />
                    </svg>
                  </span>
                </Link>
                <Link
                  href="https://github.com/shimeji-ai/Mochi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-2xl p-[2px] neural-outline transition-transform hover:-translate-y-0.5"
                  aria-label="GitHub"
                >
                  <span className="flex h-full w-full items-center justify-center rounded-[0.9rem] bg-background text-[var(--brand-accent)]">
                    <Github className="w-5 h-5" />
                  </span>
                </Link>
              </div>
            </div>

            <div>
             
              <ul className="space-y-3">
                
                <li>
                  <Link
                    href="/marketplace"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Mercado" : "Marketplace"}
                  </Link>
                </li>
                {/* <li>
                  <Link
                    href="/collection"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Colección" : "Collection"}
                  </Link>
                </li> */}
                <li>
                  <Link
                    href="/download"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Descarga" : "Download"}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Ayuda" : "Help"}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/help#feedback"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Feedback" : "Feedback"}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSpanish ? "Privacidad" : "Privacy"}
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Credits */}
          <div className="border-t border-border mt-10 pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {isSpanish ? "Creado por " : "Created by "}
              <Link
                href="https://x.com/Kathonejo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                @Kathonejo
              </Link>{" "}
              &{" "}
              <Link
                href="https://x.com/LuloxDev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                @LuloxDev
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
