import type { RefObject } from "preact";

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>;
  body: string;
  onBodyChange: (body: string) => void;
  onImage: () => void;
}

export function Toolbar({ textareaRef, body, onBodyChange, onImage }: Props) {
  const apply = (before: string, after = "", placeholder = "text") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    onBodyChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + before.length;
      textarea.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  };

  const insertBlock = (prefix: string, placeholder = "Write here") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const block = selected
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const next = `${body.slice(0, start)}${block}${body.slice(end)}`;
    onBodyChange(next);
    requestAnimationFrame(() => textarea.focus());
  };

  return (
    <div className="toolbar" aria-label="Markdown toolbar">
      <button type="button" onClick={() => apply("\n## ", "", "Heading")}>
        Heading
      </button>
      <button type="button" onClick={() => apply("**", "**")}>
        Bold
      </button>
      <button type="button" onClick={() => apply("*", "*")}>
        Italic
      </button>
      <button type="button" onClick={() => apply("[", "](https://)")}>
        Link
      </button>
      <button type="button" onClick={() => apply("`", "`", "code")}>
        Code
      </button>
      <button type="button" onClick={() => apply("\n```\n", "\n```\n", "code")}>
        Code block
      </button>
      <button type="button" onClick={() => insertBlock("- ", "List item")}>
        List
      </button>
      <button type="button" onClick={() => insertBlock("> ", "Quote")}>
        Quote
      </button>
      <button type="button" onClick={onImage}>
        Image
      </button>
    </div>
  );
}
