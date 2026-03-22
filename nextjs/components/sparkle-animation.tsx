"use client";

interface SparkleAnimationProps {
  isHovering: boolean;
}

export function SparkleAnimation({ isHovering }: SparkleAnimationProps) {
  if (!isHovering) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <span className="absolute top-0 left-0 text-xl animate-ping text-white opacity-60">
        ✦
      </span>
      <span className="absolute top-0 right-0 text-lg animate-ping animation-delay-100 text-white opacity-60">
        ✦
      </span>
      <span className="absolute bottom-0 left-1/4 text-sm animate-ping animation-delay-200 text-white opacity-60">
        ✦
      </span>
      {/* <span className="absolute bottom-0 right-0 text-xl animate-ping animation-delay-300 text-white opacity-60">
        ✦
      </span> */}
    </div>
  );
}
