"use client";

interface ScrollAnimationProps {
  children: React.ReactNode;
  variants?: any;
}

export function ScrollAnimation({ children }: ScrollAnimationProps) {
  return <div>{children}</div>;
}
