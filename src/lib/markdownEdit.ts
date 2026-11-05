/**
 * Pure text-editing helpers for the markdown toolbar and shortcuts.
 * Each returns the new text plus where the selection should be afterwards, so the editor can
 * restore the caret once the textarea has been re-rendered.
 */
export interface Edit {
  text: string;
  selStart: number;
  selEnd: number;
}

export type ToolbarAction =
  | "heading"
  | "bold"
  | "italic"
  | "link"
  | "code"
  | "codeblock"
  | "list"
  | "quote";

/** Wrap the selection (or a placeholder) in `before` / `after`, keeping it selected. */
export function wrapSelection(
  body: string,
  start: number,
  end: number,
  before: string,
  after = "",
  placeholder = "text",
): Edit {
  const selected = body.slice(start, end) || placeholder;
  const text = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
  const selStart = start + before.length;
  return { text, selStart, selEnd: selStart + selected.length };
}

/** Like wrapSelection, but starts on its own line (adds a newline only when mid-line). */
export function wrapBlock(
  body: string,
  start: number,
  end: number,
  before: string,
  after = "",
  placeholder = "text",
): Edit {
  const needsNewline = start > 0 && body[start - 1] !== "\n";
  return wrapSelection(
    body,
    start,
    end,
    `${needsNewline ? "\n" : ""}${before}`,
    after,
    placeholder,
  );
}

/** Prefix every line touched by the selection (lists, quotes). */
export function prefixLines(
  body: string,
  start: number,
  end: number,
  prefix: string,
  placeholder = "text",
): Edit {
  const lineStart = body.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = body.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? body.length : nextBreak;
  const block = body.slice(lineStart, lineEnd) || placeholder;
  const prefixed = block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
  const text = `${body.slice(0, lineStart)}${prefixed}${body.slice(lineEnd)}`;
  return { text, selStart: lineStart, selEnd: lineStart + prefixed.length };
}

export function applyAction(
  action: ToolbarAction,
  body: string,
  start: number,
  end: number,
): Edit {
  switch (action) {
    case "heading":
      return wrapBlock(body, start, end, "## ", "", "Heading");
    case "bold":
      return wrapSelection(body, start, end, "**", "**");
    case "italic":
      return wrapSelection(body, start, end, "*", "*");
    case "link":
      return wrapSelection(body, start, end, "[", "](https://)", "link text");
    case "code":
      return wrapSelection(body, start, end, "`", "`", "code");
    case "codeblock":
      return wrapBlock(body, start, end, "```\n", "\n```\n", "code");
    case "list":
      return prefixLines(body, start, end, "- ", "List item");
    case "quote":
      return prefixLines(body, start, end, "> ", "Quote");
  }
}
