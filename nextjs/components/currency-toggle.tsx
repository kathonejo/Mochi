"use client";

interface CurrencyToggleProps {
  value: "AVAX" | "USDC";
  onChange: (currency: "AVAX" | "USDC") => void;
}

export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  return (
    <div className="currency-toggle-shell inline-flex rounded-xl p-1">
      {(["AVAX", "USDC"] as const).map((currency) => (
        <button
          key={currency}
          onClick={() => onChange(currency)}
          className={`currency-toggle-option px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            value === currency
              ? "is-active"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}
