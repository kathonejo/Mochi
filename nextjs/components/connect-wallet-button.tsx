"use client";

import styled from "styled-components";
import { useWalletSession } from "@/components/wallet-provider";
import { useSmartAccount } from "@/components/smart-account-context";
import { useLanguage } from "@/components/language-provider";

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { isSpanish } = useLanguage();
  const {
    isDetecting,
    isConnected,
    isConnecting,
    publicKey,
    network,
    error,
    connect,
    disconnect,
  } = useWalletSession();
  const { isSmartAccountAvailable, openSmartAccountModal } = useSmartAccount();

  const t = (en: string, es: string) => (isSpanish ? es : en);

  const handleButtonClick = () => {
    if (isConnected) {
      disconnect();
      return;
    }

    if (!isSmartAccountAvailable) {
      void connect();
      return;
    }

    openSmartAccountModal();
  };

  return (
    <div className="relative flex items-center gap-2">
      <StyledButton
        type="button"
        onClick={handleButtonClick}
        disabled={isDetecting}
      >
        <strong className="label">
          {isDetecting
            ? t("Detecting wallet...", "Detectando wallet...")
            : isConnected
                ? t("DISCONNECT", "DESCONECTAR")
                : t("CONNECT", "CONECTAR")}
        </strong>
        <span className="stars-container" aria-hidden="true">
          <span className="stars" />
        </span>
        <span className="glow" aria-hidden="true">
          <span className="circle" />
          <span className="circle" />
        </span>
      </StyledButton>

      {isConnected && publicKey ? (
        <div className="hidden xl:flex flex-col text-xs text-muted-foreground">
          <span>{shortenAddress(publicKey)}</span>
          {network ? <span>{network}</span> : null}
        </div>
      ) : null}
      {error ? <span className="hidden xl:inline text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

const StyledButton = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 11.2rem;
  height: 3rem;
  overflow: hidden;
  cursor: pointer;
  border-radius: 5rem;
  border: double 4px transparent;
  backdrop-filter: blur(1rem);
  transition: 0.5s;
  animation: wallet-gradient-301 5s ease infinite;
  background-size: 300% 300%;
  background-image:
    linear-gradient(#0b0f14, #0b0f14),
    linear-gradient(
      120deg,
      rgba(255, 107, 53, 0.72),
      rgba(255, 255, 255, 0.16) 40%,
      rgba(255, 107, 53, 0.72) 100%
    );
  background-origin: border-box;
  background-clip: content-box, border-box;

  @media (max-width: 640px) {
    width: 90%;
    min-width: 15rem;
    margin: 0 auto;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .label {
    z-index: 2;
    font-size: 12px;
    letter-spacing: 2px;
    color: #fff4eb;
    text-shadow: 0 0 6px rgba(255, 107, 53, 0.62);
    white-space: nowrap;
  }

  .stars-container {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    border-radius: 5rem;
    transition: 0.5s;
    backdrop-filter: blur(1rem);
    background-color: #0b0f14;
  }

  .stars {
    position: relative;
    width: 200rem;
    height: 200rem;
    background: transparent;
  }

  .stars::before,
  .stars::after {
    content: "";
    position: absolute;
    background-image: radial-gradient(#ffffff 1px, transparent 1%);
    background-size: 50px 50px;
  }

  .stars::before {
    top: 0;
    left: -50%;
    width: 170%;
    height: 500%;
    opacity: 0.5;
    animation: wallet-anim-star 60s linear infinite;
  }

  .stars::after {
    top: -10rem;
    left: -100rem;
    width: 100%;
    height: 100%;
    animation: wallet-anim-star-rotate 90s linear infinite;
  }

  .glow {
    position: absolute;
    display: flex;
    width: 12rem;
  }

  .circle {
    width: 100%;
    height: 30px;
    z-index: -1;
    filter: blur(2rem);
    animation: wallet-pulse-3011 4s infinite;
  }

  .circle:nth-of-type(1) {
    background: rgba(255, 107, 53, 0.42);
  }

  .circle:nth-of-type(2) {
    background: rgba(255, 255, 255, 0.2);
  }

  &:hover:not(:disabled) {
    transform: scale(1.08);
  }

  &:active:not(:disabled) {
    border: double 4px rgba(255, 107, 53, 0.85);
    background-origin: border-box;
    background-clip: content-box, border-box;
    animation: none;
  }

  &:active:not(:disabled) .circle {
    background: rgba(255, 107, 53, 0.8);
  }

  @keyframes wallet-anim-star {
    from { transform: translateY(0); }
    to { transform: translateY(-135rem); }
  }

  @keyframes wallet-anim-star-rotate {
    from { transform: rotate(360deg); }
    to { transform: rotate(0); }
  }

  @keyframes wallet-gradient-301 {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes wallet-pulse-3011 {
    0% { transform: scale(0.75); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 0, 0, 0); }
    100% { transform: scale(0.75); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
  }
`;
