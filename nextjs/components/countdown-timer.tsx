"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  endTime: number; // Unix timestamp in seconds
  labels?: { days: string; hours: string; minutes: string; seconds: string };
  highlight?: boolean;
  compact?: boolean;
}

export function CountdownTimer({
  endTime,
  labels = { days: "days", hours: "hrs", minutes: "min", seconds: "sec" },
  highlight = false,
  compact = false,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, endTime - now);
      setTimeLeft({
        d: Math.floor(diff / 86400),
        h: Math.floor((diff % 86400) / 3600),
        m: Math.floor((diff % 3600) / 60),
        s: diff % 60,
      });
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const ended = timeLeft.d === 0 && timeLeft.h === 0 && timeLeft.m === 0 && timeLeft.s === 0;

  if (ended) {
    return (
      <div
        className={`text-center font-semibold ${highlight ? "text-base text-foreground" : "text-base text-[var(--brand-accent)]"}`}
      >
        Auction ended
      </div>
    );
  }

  const gapClass = compact ? "gap-2" : highlight ? "gap-2 sm:gap-3" : "gap-3";
  const numberClass = compact
    ? "text-xl sm:text-2xl"
    : highlight
      ? "text-3xl md:text-4xl"
      : "text-4xl md:text-5xl";
  const labelClass = compact
    ? "text-[9px] text-muted-foreground"
    : highlight
      ? "text-[10px] text-foreground/70 md:text-xs"
      : "text-sm text-muted-foreground";

  return (
    <div className={`flex justify-center ${gapClass}`}>
      {[
        { value: timeLeft.d, label: labels.days },
        { value: timeLeft.h, label: labels.hours },
        { value: timeLeft.m, label: labels.minutes },
        { value: timeLeft.s, label: labels.seconds },
      ].map(({ value, label }, index) => (
        <div
          key={label}
          className={`flex flex-col items-center ${
            highlight
              ? `countdown-unit-highlight ${index === 3 ? "countdown-seconds-pulse" : ""}`
              : ""
          }`}
        >
          <span className={`${numberClass} font-bold tabular-nums text-foreground`}>
            {String(value).padStart(2, "0")}
          </span>
          <span className={`uppercase tracking-wider ${labelClass}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
