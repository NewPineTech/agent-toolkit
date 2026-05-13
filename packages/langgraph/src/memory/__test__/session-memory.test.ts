import { describe, expect, it } from "vitest";
import {
  appendSessionTurn,
  normalizeSessionMessages,
  windowSessionMessages,
} from "../session-memory.js";

describe("session memory helpers", () => {
  it("normalizes persisted session messages defensively", () => {
    expect(
      normalizeSessionMessages([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "bad", content: "ignored" },
        { role: "user", content: "" },
      ]),
    ).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("keeps the latest session messages inside the configured window", () => {
    expect(
      windowSessionMessages(
        [
          { role: "user", content: "1" },
          { role: "assistant", content: "2" },
          { role: "user", content: "3" },
        ],
        { maxMessages: 2 },
      ),
    ).toEqual([
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
    ]);
  });

  it("appends completed user and assistant turns", () => {
    expect(
      appendSessionTurn(
        [{ role: "user", content: "old" }],
        "new question",
        "new answer",
        { maxMessages: 2 },
      ),
    ).toEqual([
      { role: "user", content: "new question" },
      { role: "assistant", content: "new answer" },
    ]);
  });
});
