import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTypingEffect } from "../useTypingEffect.js";

describe("useTypingEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with empty text and animates to full content", () => {
    const { result } = renderHook(() =>
      useTypingEffect("Hello", { charsPerTick: 1, intervalMs: 25 }),
    );

    expect(result.current.text).toBe("");
    expect(result.current.isAnimating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(125);
    });
    expect(result.current.text).toBe("Hello");
    expect(result.current.isAnimating).toBe(false);
  });

  it("reveals characters incrementally per tick", () => {
    const { result } = renderHook(() =>
      useTypingEffect("ABCDEFGH", { charsPerTick: 1, intervalMs: 25 }),
    );

    expect(result.current.text).toBe("");

    act(() => {
      vi.advanceTimersByTime(25);
    });
    expect(result.current.text).toBe("A");

    act(() => {
      vi.advanceTimersByTime(25);
    });
    expect(result.current.text).toBe("AB");

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.text).toBe("ABCDEFGH");
    expect(result.current.isAnimating).toBe(false);
  });

  it("respects custom charsPerTick and intervalMs", () => {
    const { result } = renderHook(() =>
      useTypingEffect("ABCDEF", { charsPerTick: 3, intervalMs: 50 }),
    );

    expect(result.current.text).toBe("");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.text).toBe("ABC");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.text).toBe("ABCDEF");
    expect(result.current.isAnimating).toBe(false);
  });

  it("handles new content arriving mid-animation", () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingEffect(text, { charsPerTick: 1, intervalMs: 25 }),
      { initialProps: { text: "Hello" } },
    );

    act(() => {
      vi.advanceTimersByTime(75);
    });
    expect(result.current.text).toBe("Hel");

    rerender({ text: "Hello world" });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.text).toBe("Hello world");
    expect(result.current.isAnimating).toBe(false);
  });

  it("resets when text shrinks (new conversation)", () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingEffect(text, { charsPerTick: 1, intervalMs: 25 }),
      { initialProps: { text: "Hello world" } },
    );

    act(() => {
      vi.advanceTimersByTime(275);
    });
    expect(result.current.text).toBe("Hello world");

    rerender({ text: "Hi" });

    expect(result.current.text).toBe("");
    expect(result.current.isAnimating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.text).toBe("Hi");
  });

  it("cleans up timer on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useTypingEffect("Hello"));

    act(() => {
      vi.advanceTimersByTime(25);
    });

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("returns empty string with no animation for empty input", () => {
    const { result } = renderHook(() => useTypingEffect(""));

    expect(result.current.text).toBe("");
    expect(result.current.isAnimating).toBe(false);
  });
});
