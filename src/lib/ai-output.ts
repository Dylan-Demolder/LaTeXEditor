/**
 * Strip a surrounding markdown code fence from a model response.
 *
 * The skill prompts ask for "the corrected LaTeX", and models very often wrap
 * that in ```latex … ```. Applying the raw response would paste the backticks
 * into the document, so unwrap before diffing or applying.
 *
 * Only unwraps when the fence encloses the *entire* response — a reply that
 * explains itself and happens to contain a fenced snippet is left alone,
 * because we cannot tell which part the user meant to apply.
 */
export function stripCodeFence(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith("```")) return raw;

  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) return raw;

  // The opening line must be just ``` plus an optional language tag.
  const info = text.slice(3, firstNewline).trim();
  if (info.includes("`") || /\s/.test(info)) return raw;

  if (!text.endsWith("```")) return raw;

  const body = text.slice(firstNewline + 1, -3);
  // A second fence inside means the response is prose containing snippets.
  if (body.includes("```")) return raw;

  return body.replace(/\n$/, "");
}
