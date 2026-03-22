"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";

interface UpdatesSubscribePopupProps {
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "ghost";
}

export function UpdatesSubscribePopup({
  buttonClassName = "",
  buttonVariant = "default",
}: UpdatesSubscribePopupProps) {
  const { isSpanish } = useLanguage();
  const updatesXUrl = "https://x.com/MochiAgents";

  return (
    <Button asChild variant={buttonVariant} className={`${buttonClassName} cursor-pointer`.trim()}>
      <Link href={updatesXUrl} target="_blank" rel="noopener noreferrer">
        <svg
          viewBox="0 0 24 24"
          className="mr-2 h-4 w-4 shrink-0 text-current"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M18.244 2H21.5l-7.266 8.304L22.67 22h-6.59l-5.16-7.196L4.62 22H1.36l7.773-8.89L1.08 2h6.757l4.663 6.52L18.244 2Zm-1.144 18h1.83L6.78 3.896H4.814L17.1 20Z" />
        </svg>
        {isSpanish ? "Suscribirme a novedades" : "Subscribe for Updates"}
      </Link>
    </Button>
  );
}
