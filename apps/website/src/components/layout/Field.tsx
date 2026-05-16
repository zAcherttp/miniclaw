type FieldProps = {
  label: string;
  description?: string;
  children: React.ReactNode;
};

export function Field({ label, description, children }: FieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30"
    />
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30"
    />
  );
}

export function CheckboxField({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="grid gap-1">
        <span className="text-sm font-medium">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}
