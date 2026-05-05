import { useState, useRef, useEffect } from "react";

export interface SelectOption {
  id: number;
  label: string;
}

interface Props {
  options: SelectOption[];
  placeholder?: string;
  onSelect: (option: SelectOption) => void;
}

export default function SearchableSelect({ options, placeholder = "Hledat…", onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(option: SelectOption) {
    onSelect(option);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="searchable-select" ref={ref}>
      <input
        type="text"
        className="searchable-select__input"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <ul className="searchable-select__dropdown">
          {filtered.length === 0 ? (
            <li className="searchable-select__empty">Žádné výsledky</li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.id}
                className="searchable-select__option"
                onMouseDown={() => handleSelect(o)}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
