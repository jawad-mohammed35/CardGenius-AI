"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export function AccentSelect<T extends string>({ label, value, options, onChange, disabled, hideLabel }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const expanded = open && !disabled;

  useLayoutEffect(() => {
    if (!expanded || !trigger.current || !popup.current) return;
    const button = trigger.current;
    const list = popup.current;
    function position() {
      const rect = button.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const opensUp = below < Math.min(list.scrollHeight, 260) && above > below;
      const width = Math.min(Math.max(rect.width, 154), document.documentElement.clientWidth - 16);
      list.style.width = `${width}px`;
      list.style.left = `${Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - width - 8))}px`;
      list.style.maxHeight = `${Math.min(260, Math.max(36, opensUp ? above : below))}px`;
      list.style.top = opensUp ? "auto" : `${rect.bottom + 5}px`;
      list.style.bottom = opensUp ? `${window.innerHeight - rect.top + 5}px` : "auto";
    }
    list.showPopover?.();
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      list.hidePopover?.();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded || !popup.current) return;
    const list = popup.current;
    const option = list.children.item(active) as HTMLElement | null;
    if (option && option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    if (option && option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [active, expanded]);

  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === "Tab") {
      if (expanded) choose(active);
      return;
    }
    if (key === "Escape" && expanded) setOpen(false);
    else if (key === " " || key === "Enter") {
      if (expanded) choose(active);
      else { setActive(Math.max(0, selected)); setOpen(true); }
    } else if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(key)) {
      const start = expanded ? active : selected;
      const index = key === "Home" ? 0 : key === "End" ? options.length - 1 :
        start + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : key === "PageDown" ? 10 : -10);
      setActive(Math.max(0, Math.min(options.length - 1, index)));
      setOpen(true);
    } else if (key.length === 1) {
      const now = Date.now();
      const letter = key.toLocaleLowerCase();
      const previous = now - typed.current.at < 600 ? typed.current.text : "";
      const search = previous === letter ? letter : previous + letter;
      const start = search.length === 1 ? (expanded ? active : selected) + 1 : 0;
      const match = options.map((_, index) => (index + start) % options.length)
        .find((index) => options[index].label.toLocaleLowerCase().startsWith(search));
      typed.current = { text: search, at: now };
      if (match !== undefined) { setActive(match); setOpen(true); }
    } else return;
    event.preventDefault();
  }

  return <div className="accent-select">
    <span id={`${id}-label`} className={hideLabel ? "sr-only" : undefined}>{label}</span>
    <button className="accent-select-trigger" type="button" ref={trigger} role="combobox" disabled={disabled}
      aria-labelledby={`${id}-label`} aria-expanded={expanded} aria-controls={id}
      aria-activedescendant={expanded ? `${id}-${active}` : undefined}
      onBlur={() => setOpen(false)} onKeyDown={keyDown}
      onClick={() => { setActive(Math.max(0, selected)); setOpen(!open); }}>
      <span>{options[selected]?.label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    <ul ref={popup} id={id} role="listbox" aria-labelledby={`${id}-label`} popover="manual"
      className="accent-select-options" hidden={!expanded} onMouseDown={(event) => event.preventDefault()}>
      {expanded && options.map((option, index) => <li key={option.value} id={`${id}-${index}`}
        role="option" aria-selected={selected === index} data-active={active === index || undefined}
        onClick={() => choose(index)} onPointerMove={(event) => { if (event.pointerType === "mouse") setActive(index); }}>
        <span>{option.label}</span>{selected === index && <Check size={15} aria-hidden="true" />}
      </li>)}
    </ul>
  </div>;
}
