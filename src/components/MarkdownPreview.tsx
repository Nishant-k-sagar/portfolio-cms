import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useRef } from "preact/hooks";

// Mermaid is loaded only when the preview actually contains a diagram, so the editor
// bundle stays small. Diagram source is rendered by Mermaid in strict mode (labels sanitised).
let diagramCounter = 0;
async function renderDiagrams(root: HTMLElement) {
  const blocks = root.querySelectorAll<HTMLElement>(
    "pre > code.language-mermaid",
  );
  if (blocks.length === 0) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre?.isConnected) continue;
    const id = `cms-mermaid-${diagramCounter++}`;
    try {
      const { svg } = await mermaid.render(id, code.textContent ?? "");
      if (!pre.isConnected) continue;
      const figure = document.createElement("div");
      figure.className = "mermaid-diagram";
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch {
      // Invalid diagram: keep the code block so the author can fix the syntax.
      // Mermaid leaves a temporary error element behind; remove it.
      document.getElementById(`d${id}`)?.remove();
    }
  }
}

export function MarkdownPreview({ body }: { body: string }) {
  const html = DOMPurify.sanitize(
    marked.parse(body || "", {
      async: false,
      gfm: true,
      breaks: false,
    }) as string,
    {
      ALLOWED_TAGS: [
        "a",
        "p",
        "br",
        "strong",
        "em",
        "code",
        "pre",
        "ul",
        "ol",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "img",
        "hr",
        "del",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
    },
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) void renderDiagrams(ref.current);
  }, [html]);
  return (
    <article
      ref={ref}
      className="prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
