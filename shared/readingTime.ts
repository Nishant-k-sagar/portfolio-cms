export interface ReadingStats {
  words: number;
  minutes: number;
}

export function readingStats(markdown: string): ReadingStats {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.ceil(words / 200)) };
}
