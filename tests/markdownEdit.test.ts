import { describe, expect, it } from "vitest";
import {
  applyAction,
  prefixLines,
  wrapBlock,
  wrapSelection,
} from "../src/lib/markdownEdit";

describe("wrapSelection", () => {
  it("wraps the selected word and keeps exactly that word selected", () => {
    const edit = wrapSelection("First paragraph", 0, 5, "**", "**");
    expect(edit.text).toBe("**First** paragraph");
    expect(edit.text.slice(edit.selStart, edit.selEnd)).toBe("First");
  });

  it("inserts a selected placeholder when nothing is selected", () => {
    const edit = wrapSelection("abc", 3, 3, "`", "`", "code");
    expect(edit.text).toBe("abc`code`");
    expect(edit.text.slice(edit.selStart, edit.selEnd)).toBe("code");
  });
});

describe("wrapBlock", () => {
  it("does not add a leading blank line at the start of the document", () => {
    const edit = applyAction("heading", "", 0, 0);
    expect(edit.text).toBe("## Heading");
    expect(edit.text.slice(edit.selStart, edit.selEnd)).toBe("Heading");
  });

  it("starts a new line when the caret is mid-line", () => {
    const edit = wrapBlock("some text", 9, 9, "## ", "", "Heading");
    expect(edit.text).toBe("some text\n## Heading");
  });

  it("does not add a newline at the start of an existing line", () => {
    const edit = wrapBlock("line one\n", 9, 9, "## ", "", "Heading");
    expect(edit.text).toBe("line one\n## Heading");
  });

  it("builds a fenced code block", () => {
    const edit = applyAction("codeblock", "", 0, 0);
    expect(edit.text).toBe("```\ncode\n```\n");
    expect(edit.text.slice(edit.selStart, edit.selEnd)).toBe("code");
  });
});

describe("prefixLines", () => {
  it("prefixes every line touched by the selection, even if it starts mid-line", () => {
    const body = "one\ntwo\nthree";
    const edit = prefixLines(body, 5, 9, "- ");
    expect(edit.text).toBe("one\n- two\n- three");
  });

  it("inserts a placeholder item on an empty line", () => {
    const edit = applyAction("list", "", 0, 0);
    expect(edit.text).toBe("- List item");
  });

  it("quotes a single line", () => {
    const edit = applyAction("quote", "hello", 0, 5);
    expect(edit.text).toBe("> hello");
    expect(edit.selStart).toBe(0);
    expect(edit.selEnd).toBe(edit.text.length);
  });
});
