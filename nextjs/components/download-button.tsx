"use client";

import React from "react";
import styled from "styled-components";
import Link from "next/link";
import { useLanguage } from "./language-provider";

interface DownloadButtonProps {
  href?: string;
  labelEn?: string;
  labelEs?: string;
}

const DownloadButton = ({
  href = "/download",
  labelEn = "DOWNLOAD!",
  labelEs = "¡DESCARGAR!",
}: DownloadButtonProps) => {
  const { isSpanish } = useLanguage();
  return (
    <StyledWrapper>
      <Link href={href} className="btn">
        <strong>{isSpanish ? labelEs : labelEn}</strong>
        <div id="container-stars">
          <div id="stars" />
        </div>
        <div id="glow">
          <div className="circle" />
          <div className="circle" />
        </div>
      </Link>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .btn {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 9.75rem;
    overflow: hidden;
    height: 3rem;
    background-size: 300% 300%;
    cursor: pointer;
    backdrop-filter: blur(1rem);
    border-radius: 5rem;
    transition: 0.5s;
    animation: gradient_301 5s ease infinite;
    border: double 4px transparent;
    text-decoration: none;
    background-image: linear-gradient(#0b0f14, #0b0f14),
      linear-gradient(
        120deg,
        rgba(134, 240, 255, 0.6),
        rgba(255, 255, 255, 0.15) 40%,
        rgba(134, 240, 255, 0.6) 100%
      );
    background-origin: border-box;
    background-clip: content-box, border-box;
  }

  @media (max-width: 640px) {
    .btn {
      width: 75%;
      margin: 0 auto;
    }
  }

  #container-stars {
    position: absolute;
    z-index: -1;
    width: 100%;
    height: 100%;
    overflow: hidden;
    transition: 0.5s;
    backdrop-filter: blur(1rem);
    border-radius: 5rem;
  }

  strong {
    z-index: 2;
    font-size: 12px;
    letter-spacing: 3px;
    color: #e6f6ff;
    text-shadow: 0 0 6px rgba(134, 240, 255, 0.6);
  }

  #glow {
    position: absolute;
    display: flex;
    width: 12rem;
  }

  .circle {
    width: 100%;
    height: 30px;
    filter: blur(2rem);
    animation: pulse_3011 4s infinite;
    z-index: -1;
  }

  .circle:nth-of-type(1) {
    background: rgba(134, 240, 255, 0.4);
  }

  .circle:nth-of-type(2) {
    background: rgba(255, 255, 255, 0.2);
  }

  .btn:hover #container-stars {
    z-index: 1;
    background-color: #0b0f14;
  }

  .btn:hover {
    transform: scale(1.1);
  }

  .btn:active {
    border: double 4px rgba(134, 240, 255, 0.8);
    background-origin: border-box;
    background-clip: content-box, border-box;
    animation: none;
  }

  .btn:active .circle {
    background: rgba(134, 240, 255, 0.8);
  }

  #stars {
    position: relative;
    background: transparent;
    width: 200rem;
    height: 200rem;
  }

  #stars::after {
    content: "";
    position: absolute;
    top: -10rem;
    left: -100rem;
    width: 100%;
    height: 100%;
    animation: animStarRotate 90s linear infinite;
  }

  #stars::after {
    background-image: radial-gradient(#ffffff 1px, transparent 1%);
    background-size: 50px 50px;
  }

  #stars::before {
    content: "";
    position: absolute;
    top: 0;
    left: -50%;
    width: 170%;
    height: 500%;
    animation: animStar 60s linear infinite;
  }

  #stars::before {
    background-image: radial-gradient(#ffffff 1px, transparent 1%);
    background-size: 50px 50px;
    opacity: 0.5;
  }

  @keyframes animStar {
    from {
      transform: translateY(0);
    }

    to {
      transform: translateY(-135rem);
    }
  }

  @keyframes animStarRotate {
    from {
      transform: rotate(360deg);
    }

    to {
      transform: rotate(0);
    }
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

  @keyframes pulse_3011 {
    0% {
      transform: scale(0.75);
      box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.7);
    }

    70% {
      transform: scale(1);
      box-shadow: 0 0 0 10px rgba(0, 0, 0, 0);
    }

    100% {
      transform: scale(0.75);
      box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
    }
  }
`;

export default DownloadButton;
