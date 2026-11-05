import type { FieldConfig, FieldValue } from "../../shared/types";

interface Props {
  field: FieldConfig;
  value: FieldValue | undefined;
  error?: string;
  onChange: (name: string, value: FieldValue) => void;
}

export function FieldInput({ field, value, error, onChange }: Props) {
  const id = `field-${field.name}`;
  const label = field.label ?? field.name;
  const describedBy = field.help || error ? `${id}-help` : undefined;

  const common = {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
  };

  if (field.type === "boolean") {
    return (
      <div className="field">
        <label
          htmlFor={id}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            fontWeight: 700,
          }}
        >
          <input
            {...common}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) =>
              onChange(
                field.name,
                (event.currentTarget as HTMLInputElement).checked,
              )
            }
          />
          {label}
        </label>
        {field.help ? (
          <p id={describedBy} className="muted">
            {field.help}
          </p>
        ) : null}
        {error ? (
          <p id={describedBy} className="error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="field">
        <label htmlFor={id}>
          {label}
          {field.required ? " *" : ""}
        </label>
        <select
          {...common}
          className="select"
          value={String(value ?? field.default ?? "")}
          onChange={(event) => onChange(field.name, event.currentTarget.value)}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <FieldHelp id={describedBy} help={field.help} error={error} />
      </div>
    );
  }

  if (
    field.type === "text" ||
    field.type === "markdown" ||
    (field.rows && field.rows > 2)
  ) {
    return (
      <div className="field">
        <label htmlFor={id}>
          {label}
          {field.required ? " *" : ""}
        </label>
        <textarea
          {...common}
          className="textarea"
          style={{
            minHeight: `${Math.max(80, (field.rows ?? 3) * 34)}px`,
            fontFamily: "inherit",
          }}
          value={String(value ?? "")}
          maxLength={field.max}
          onInput={(event) => onChange(field.name, event.currentTarget.value)}
        />
        <FieldHelp id={describedBy} help={field.help} error={error} />
      </div>
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "number"
        ? "number"
        : field.type === "url"
          ? "url"
          : "text";
  const textValue =
    field.type === "list" && Array.isArray(value)
      ? value.join(", ")
      : String(value ?? "");

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {field.required ? " *" : ""}
      </label>
      <input
        {...common}
        className="input"
        type={inputType}
        inputMode={field.type === "number" ? "numeric" : undefined}
        value={textValue}
        maxLength={field.max}
        placeholder={field.placeholder}
        onInput={(event) => {
          const raw = event.currentTarget.value;
          if (field.type === "list")
            onChange(
              field.name,
              raw
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            );
          else if (field.type === "number")
            onChange(field.name, raw === "" ? undefined : Number(raw));
          else onChange(field.name, raw);
        }}
      />
      <FieldHelp id={describedBy} help={field.help} error={error} />
    </div>
  );
}

function FieldHelp({
  id,
  help,
  error,
}: {
  id?: string;
  help?: string;
  error?: string;
}) {
  if (error)
    return (
      <p id={id} className="error">
        {error}
      </p>
    );
  if (help)
    return (
      <p id={id} className="muted">
        {help}
      </p>
    );
  return null;
}
