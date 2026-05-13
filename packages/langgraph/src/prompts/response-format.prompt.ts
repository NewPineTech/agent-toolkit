export function buildResponseFormatRules(): string {
  return [
    "Response format contract:",
    "- Markdown is the default text format.",
    "- References must point to retrieved chunks or tool result ids.",
    "- Chart artifacts must be valid JSON metadata, preferably Vega-Lite compatible or an internal lightweight chart schema.",
    "- Image artifacts must include safe metadata only; do not embed arbitrary untrusted URLs in text.",
    "- Tables should be represented as Markdown tables in streamed text and as structured metadata when available.",
  ].join("\n");
}
