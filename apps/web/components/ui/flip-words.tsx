"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, m } from "motion/react";

export function FlipWords({
  words,
  duration = 3000,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % words.length),
      duration
    );
    return () => clearTimeout(t);
  }, [index, duration, words.length]);

  return (
    <AnimatePresence mode="popLayout">
      <m.span
        key={index}
        initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className={className}
        style={{ display: "inline-block" }}
      >
        {words[index]}
      </m.span>
    </AnimatePresence>
  );
}
