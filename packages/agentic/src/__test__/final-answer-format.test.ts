import { describe, expect, it } from "vitest";
import { normalizeFinalAnswerMarkdown } from "../final-answer-format.js";

describe("normalizeFinalAnswerMarkdown", () => {
  it("removes duplicated Vietnamese step labels from ordered process lists", () => {
    const answer = [
      "Quy trinh tuyen dung gom 2 buoc:",
      "",
      "1. **Bước 1: Đề xuất và Tổng hợp nhu cầu:** Bộ phận co nhu cau lam de xuat.",
      "2. **Bước 2: Đánh giá, phân tích:** Phong Nhan su xem xet nhu cau.",
    ].join("\n");

    expect(normalizeFinalAnswerMarkdown(answer)).toBe(
      [
        "Quy trinh tuyen dung gom 2 buoc:",
        "",
        "1. **Đề xuất và Tổng hợp nhu cầu:** Bộ phận co nhu cau lam de xuat.",
        "2. **Đánh giá, phân tích:** Phong Nhan su xem xet nhu cau.",
      ].join("\n"),
    );
  });

  it("keeps non-list step references unchanged", () => {
    const answer = "Bước 1: Bộ phận co nhu cau lam de xuat tuyen dung.";

    expect(normalizeFinalAnswerMarkdown(answer)).toBe(answer);
  });

  it("removes bolded label-only step prefixes without leaving empty bold markers", () => {
    const answer = "1. **Bước 1:** Đề xuất và Tổng hợp nhu cầu.";

    expect(normalizeFinalAnswerMarkdown(answer)).toBe(
      "1. Đề xuất và Tổng hợp nhu cầu.",
    );
  });
});
