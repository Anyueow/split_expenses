import { CATEGORIES, CATEGORY_EMOJI, type Category } from "../lib/types";

const LABELS: Record<Category, string> = {
  food: "Food",
  drinks: "Drinks",
  transport: "Transport",
  stay: "Stay",
  activities: "Activities",
  shopping: "Shopping",
  groceries: "Groceries",
  other: "Other",
};

export function categoryLabel(category: Category): string {
  return LABELS[category] ?? category;
}

export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category;
  onChange: (category: Category) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Category" className="grid grid-cols-4 gap-2">
      {CATEGORIES.map((category) => {
        const selected = category === value;
        return (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(category)}
            className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${
              selected
                ? "border-primary bg-primary-light"
                : "border-[#E4E4EF] bg-white hover:bg-neutral-100"
            }`}
          >
            <span aria-hidden className="text-xl leading-none">
              {CATEGORY_EMOJI[category]}
            </span>
            <span
              className={`text-[11px] font-medium ${
                selected ? "text-primary" : "text-neutral-500"
              }`}
            >
              {LABELS[category]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal "All + per-category" filter used on the expenses tab. */
export function CategoryFilter({
  value,
  onChange,
  available,
}: {
  value: Category | "all";
  onChange: (value: Category | "all") => void;
  available: Category[];
}) {
  const options = CATEGORIES.filter((c) => available.includes(c));
  if (options.length < 2) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Filter by category"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      <FilterPill
        selected={value === "all"}
        onClick={() => onChange("all")}
        label="All"
      />
      {options.map((category) => (
        <FilterPill
          key={category}
          selected={value === category}
          onClick={() => onChange(category)}
          label={LABELS[category]}
          emoji={CATEGORY_EMOJI[category]}
        />
      ))}
    </div>
  );
}

function FilterPill({
  selected,
  onClick,
  label,
  emoji,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
        selected
          ? "border-primary bg-primary text-white"
          : "border-[#E4E4EF] bg-white text-neutral-500"
      }`}
    >
      {emoji && (
        <span aria-hidden className="text-sm leading-none">
          {emoji}
        </span>
      )}
      {label}
    </button>
  );
}
