import type { EntryState } from "../../shared/types";

export function StateBadge({ state }: { state: EntryState | string }) {
  const label =
    state === "published-with-changes"
      ? "Published with changes"
      : state[0].toUpperCase() + state.slice(1);
  const className =
    state === "published"
      ? "published"
      : state === "draft"
        ? "draft"
        : "changed";
  return <span className={`badge ${className}`}>{label}</span>;
}
