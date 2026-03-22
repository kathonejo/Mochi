type InputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "url";
  textarea?: boolean;
  rows?: number;
  disabled?: boolean;
};

export function InputField(props: InputFieldProps) {
  const baseClassName =
    "w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{props.label}</span>
      {props.textarea ? (
        <textarea
          className={baseClassName}
          rows={props.rows ?? 3}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
        />
      ) : (
        <input
          className={baseClassName}
          type={props.type || "text"}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
        />
      )}
    </label>
  );
}

type ToggleFieldProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function ToggleField(props: ToggleFieldProps) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white/5 p-3 text-sm">
      <span className="flex-1">
        <span className="block text-foreground">{props.label}</span>
        <span className="block text-xs text-muted-foreground">{props.description}</span>
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        disabled={props.disabled}
        className="mt-1 h-4 w-4 accent-emerald-400"
      />
    </label>
  );
}
