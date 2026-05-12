"use client";

import { useEffect, useId, useRef, useState } from "react";

export type DropdownCheckboxOption = { id: number; label: string; disabled?: boolean };

type Props = {
  label: string;
  placeholder?: string;
  options: DropdownCheckboxOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function DropdownCheckboxMultiselect({
  label,
  placeholder = "Selecione…",
  options,
  value,
  onChange,
  disabled,
}: Props) {
  const baseId = useId();
  const menuId = `${baseId}-menu`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedSet = new Set(value);
  const activeOptions = options.filter((o) => !o.disabled);
  const summary =
    value.length === 0
      ? placeholder
      : value
          .map((id) => options.find((o) => o.id === id)?.label)
          .filter((t): t is string => Boolean(t && t.trim()))
          .join(", ");

  function toggle(id: number) {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <>
      <label className="d-block">{label}</label>
      <div ref={wrapRef} className="position-relative">
        <button
          type="button"
          className="form-control text-left d-flex justify-content-between align-items-center"
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={menuId}
        >
          <span className={`text-truncate ${value.length === 0 ? "text-muted" : ""}`}>{summary}</span>
          <i className={`fas fa-chevron-${open ? "up" : "down"} ml-2 small text-muted flex-shrink-0`} aria-hidden />
        </button>
        {open ? (
          <div
            id={menuId}
            className="border rounded bg-white shadow-sm position-absolute w-100 mt-1"
            style={{ zIndex: 1060, maxHeight: 240, overflowY: "auto" }}
            role="listbox"
            aria-multiselectable
          >
            {activeOptions.length === 0 ? (
              <div className="px-3 py-2 text-muted small">Nenhuma opção disponível.</div>
            ) : (
              activeOptions.map((o) => (
                <label
                  key={o.id}
                  className="d-flex align-items-center px-3 py-2 mb-0 border-bottom small"
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    className="mr-2 mt-0"
                    checked={selectedSet.has(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="flex-grow-1 text-truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
