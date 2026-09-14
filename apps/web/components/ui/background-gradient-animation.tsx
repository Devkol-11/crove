"use client";

import { useEffect, useRef, useState } from "react";

interface BackgroundGradientAnimationProps {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  interactive?: boolean;
}

export function BackgroundGradientAnimation({
  children,
  className,
  containerClassName,
  interactive = true,
}: BackgroundGradientAnimationProps) {
  const interactiveRef = useRef<HTMLDivElement>(null);
  const [curX, setCurX] = useState(0);
  const [curY, setCurY] = useState(0);
  const [tgX, setTgX] = useState(0);
  const [tgY, setTgY] = useState(0);

  useEffect(() => {
    if (!interactive) return;
    function move() {
      if (!interactiveRef.current) return;
      setCurX((x) => x + (tgX - x) / 20);
      setCurY((y) => y + (tgY - y) / 20);
      interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
    }
    move();
  }, [tgX, tgY, curX, curY, interactive]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!interactive || !interactiveRef.current) return;
    const rect = interactiveRef.current.parentElement!.getBoundingClientRect();
    setTgX(e.clientX - rect.left);
    setTgY(e.clientY - rect.top);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`relative overflow-hidden ${containerClassName ?? ""}`}
      style={{
        background: "linear-gradient(135deg, #0b0d10 0%, #0f1115 50%, #14171c 100%)",
      }}
    >
      {/* Blur layer containing all animated blobs */}
      <div
        className="absolute inset-0"
        style={{ filter: "blur(80px)", opacity: 0.65 }}
      >
        {/* Blob 1 — gold, slow vertical drift */}
        <div
          className="absolute top-[40%] left-[30%] w-[45%] h-[45%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(255,200,37,0.55) 0%, rgba(255,200,37,0) 70%)",
            animation: "var(--animate-blob-first)",
            transformOrigin: "center center",
          }}
        />

        {/* Blob 2 — amber-deep, counter-clockwise circle */}
        <div
          className="absolute top-[10%] left-[50%] w-[40%] h-[40%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(212,160,16,0.4) 0%, rgba(212,160,16,0) 70%)",
            animation: "var(--animate-blob-second)",
            transformOrigin: "calc(50% - 200px) calc(50% + 100px)",
          }}
        />

        {/* Blob 3 — dark warm, slow clockwise circle, adds depth */}
        <div
          className="absolute top-[60%] left-[20%] w-[35%] h-[35%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(255,170,0,0.2) 0%, rgba(255,170,0,0) 70%)",
            animation: "var(--animate-blob-third)",
            transformOrigin: "calc(50% + 200px) calc(50% - 100px)",
          }}
        />

        {/* Blob 4 — horizontal sweep, very subtle warm tone */}
        <div
          className="absolute top-[20%] left-[10%] w-[50%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(255,200,37,0.15) 0%, rgba(255,200,37,0) 70%)",
            animation: "var(--animate-blob-fourth)",
            transformOrigin: "calc(50% - 100px) center",
          }}
        />

        {/* Blob 5 — near-black surface tone, grounds the glow */}
        <div
          className="absolute top-[50%] left-[60%] w-[30%] h-[30%] rounded-full"
          style={{
            background: "radial-gradient(circle at center, rgba(20,23,28,0.9) 0%, rgba(20,23,28,0) 70%)",
            animation: "var(--animate-blob-fifth)",
            transformOrigin: "calc(50% - 150px) calc(50% + 150px)",
          }}
        />
      </div>

      {/* Interactive follow blob — tracks cursor */}
      {interactive && (
        <div
          ref={interactiveRef}
          className="absolute w-[30%] h-[30%] rounded-full opacity-50 pointer-events-none"
          style={{
            background: "radial-gradient(circle at center, rgba(255,200,37,0.25) 0%, rgba(255,200,37,0) 70%)",
            top: "-15%",
            left: "-15%",
            filter: "blur(60px)",
          }}
        />
      )}

      {/* Content sits above the blobs */}
      <div className={`relative z-10 ${className ?? ""}`}>{children}</div>
    </div>
  );
}