import DOMPurify from "dompurify";
import { marked } from "marked";

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
  return (
    <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
