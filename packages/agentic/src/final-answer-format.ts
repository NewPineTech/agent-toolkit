const BOLDED_ORDERED_STEP_LABEL_ONLY_PATTERN =
  /^([ \t]*\d+[.)][ \t]+)\*\*[ \t]*(?:Bước|Buoc)[ \t]+\d{1,2}(?:\.\d+)?[ \t]*[:.-][ \t]*\*\*[ \t]*/gim;
const ORDERED_STEP_ITEM_PATTERN =
  /^([ \t]*\d+[.)][ \t]+)(\*\*)?[ \t]*(?:Bước|Buoc)[ \t]+\d{1,2}(?:\.\d+)?[ \t]*[:.-][ \t]*/gim;

export function normalizeFinalAnswerMarkdown(answer: string): string {
  return answer
    .replace(BOLDED_ORDERED_STEP_LABEL_ONLY_PATTERN, "$1")
    .replace(
      ORDERED_STEP_ITEM_PATTERN,
      (_match, listMarker: string, boldMarker: string | undefined) =>
        `${listMarker}${boldMarker ?? ""}`,
    );
}
