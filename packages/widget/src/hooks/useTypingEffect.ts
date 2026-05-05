import { useState, useEffect, useRef } from "react";

export interface UseTypingEffectOptions {
  charsPerTick?: number;
  intervalMs?: number;
}

export interface UseTypingEffectReturn {
  text: string;
  isAnimating: boolean;
}

export function useTypingEffect(
  fullText: string,
  options: UseTypingEffectOptions = {},
): UseTypingEffectReturn {
  const { charsPerTick = 4, intervalMs = 25 } = options;
  const [displayed, setDisplayed] = useState("");
  const cursorRef = useRef(0);

  const isAnimating = displayed !== fullText;

  useEffect(() => {
    if (fullText.length < cursorRef.current) {
      cursorRef.current = 0;
      setDisplayed("");
    }

    if (cursorRef.current >= fullText.length) {
      if (displayed !== fullText) setDisplayed(fullText);
      return;
    }

    const timer = setInterval(() => {
      cursorRef.current = Math.min(
        cursorRef.current + charsPerTick,
        fullText.length,
      );
      setDisplayed(fullText.slice(0, cursorRef.current));

      if (cursorRef.current >= fullText.length) {
        clearInterval(timer);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [fullText, charsPerTick, intervalMs, displayed]);

  return { text: displayed, isAnimating };
}
