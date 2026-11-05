import type { ToolbarAction } from "../lib/markdownEdit";

interface Props {
  disabled?: boolean;
  onAction: (action: ToolbarAction) => void;
  onImage: () => void;
}

const BUTTONS: Array<{ action: ToolbarAction; label: string; title: string }> =
  [
    { action: "heading", label: "Heading", title: "Heading" },
    { action: "bold", label: "Bold", title: "Bold (Ctrl+B)" },
    { action: "italic", label: "Italic", title: "Italic (Ctrl+I)" },
    { action: "link", label: "Link", title: "Link (Ctrl+K)" },
    { action: "code", label: "Code", title: "Inline code" },
    { action: "codeblock", label: "Code block", title: "Code block" },
    { action: "list", label: "List", title: "Bulleted list" },
    { action: "quote", label: "Quote", title: "Quote" },
  ];

export function Toolbar({ disabled = false, onAction, onImage }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Markdown toolbar">
      {BUTTONS.map((button) => (
        <button
          key={button.action}
          type="button"
          title={button.title}
          disabled={disabled}
          // Keep focus (and the selection) in the textarea while clicking.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(button.action)}
        >
          {button.label}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onImage}
      >
        Image
      </button>
    </div>
  );
}
