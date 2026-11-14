import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { LuCheck, LuChevronDown, LuSparkles, LuX } from 'react-icons/lu';
import type { Language, Level } from '../types';
import { FALLBACK_FLAG, LANGUAGES, LEVELS, getLanguage } from '../data/languages';
import { useClickOutside } from '../lib/hooks';

/* ---------- Flag ---------- */

interface FlagProps {
  code: string;
  size?: 'sm' | 'md' | 'lg';
  /** show the "why this flag" note as a tooltip */
  explain?: boolean;
}

/** Always an SVG image with fixed 3:2 proportions – never an emoji, never a country code. */
export function Flag({ code, size = 'md', explain = false }: FlagProps) {
  const lang = getLanguage(code);
  const [broken, setBroken] = useState(false);
  return (
    <img
      className={`flag flag--${size}`}
      src={broken ? FALLBACK_FLAG : lang.flag}
      alt=""
      aria-hidden="true"
      title={explain ? lang.flagNote : undefined}
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

/* ---------- Language select ---------- */

interface LanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
  label: string;
  /** hide the visible label but keep it for screen readers */
  hideLabel?: boolean;
  exclude?: string;
  compact?: boolean;
  /** adds a first option with the value "auto" (Lingua Translate's “Detect language”) */
  auto?: { label: string; detected?: string };
}

export function LanguageSelect({ value, onChange, label, hideLabel, exclude, compact, auto }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const isAuto = Boolean(auto) && value === 'auto';
  const current = getLanguage(value);
  const options = LANGUAGES.filter((l) => l.code !== exclude);

  useClickOutside(wrapRef, () => setOpen(false), open);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  const pick = (lang: Language) => {
    onChange(lang.code);
    setOpen(false);
  };

  const pickAuto = () => {
    onChange('auto');
    setOpen(false);
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  };

  return (
    <div className={`field ${compact ? 'field--compact' : ''}`} ref={wrapRef}>
      <span className={hideLabel ? 'sr-only' : 'field__label'} id={`${id}-label`}>
        {label}
      </span>
      <div className="select">
        <button
          type="button"
          className="select__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => setOpen((o) => !o)}
        >
          {isAuto ? <LuSparkles className="select__auto" aria-hidden="true" /> : <Flag code={current.code} size="sm" />}
          <span id={`${id}-value`} className="select__value">
            {isAuto ? (auto?.detected ? `${getLanguage(auto.detected).name} (detected)` : auto?.label) : current.name}
          </span>
          <LuChevronDown className="select__chevron" aria-hidden="true" />
        </button>
        {open && (
          <ul className="select__list" role="listbox" aria-labelledby={`${id}-label`} ref={listRef} onKeyDown={onListKey}>
            {auto && (
              <li
                role="option"
                tabIndex={0}
                aria-selected={isAuto}
                className="select__option"
                onClick={pickAuto}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickAuto();
                  }
                }}
              >
                <LuSparkles className="select__auto" aria-hidden="true" />
                <span className="select__option-name">{auto.label}</span>
                <span className="select__option-native" />
                {isAuto && <LuCheck className="select__check" aria-hidden="true" />}
              </li>
            )}
            {options.map((lang) => (
              <li
                key={lang.code}
                role="option"
                tabIndex={0}
                aria-selected={lang.code === value}
                className="select__option"
                onClick={() => pick(lang)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(lang);
                  }
                }}
              >
                <Flag code={lang.code} size="sm" />
                <span className="select__option-name">{lang.name}</span>
                <span className="select__option-native" lang={lang.code} dir={lang.rtl ? 'rtl' : 'ltr'}>
                  {lang.nativeName}
                </span>
                {lang.code === value && <LuCheck className="select__check" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- Level select ---------- */

interface LevelSelectProps {
  value: Level;
  onChange: (level: Level) => void;
  label?: string;
}

export function LevelSelect({ value, onChange, label = 'Level' }: LevelSelectProps) {
  const current = LEVELS.find((l) => l.id === value) ?? LEVELS[0];
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="levels" role="radiogroup" aria-label={label}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={l.id === value}
            className={`levels__item ${l.id === value ? 'is-active' : ''}`}
            title={`${l.name} – ${l.summary}`}
            onClick={() => onChange(l.id)}
          >
            {l.id}
          </button>
        ))}
      </div>
      <span className="field__hint">
        {current.name}: {current.summary.toLowerCase()}
      </span>
    </div>
  );
}

/* ---------- Modal ---------- */

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** onboarding cannot be dismissed */
  locked?: boolean;
  wide?: boolean;
}

export function Modal({ title, onClose, children, footer, locked, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [locked, onClose]);

  return (
    <div
      className="modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div className={`modal__panel ${wide ? 'modal__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <h2 id={id}>{title}</h2>
          {!locked && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <LuX />
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

/* ---------- Small pieces ---------- */

export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 55% 38%)` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ProgressRing({ value, max, size = 132, children }: { value: number; max: number; size?: number; children?: ReactNode }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  );
}

export function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-row__label">
          {label}
        </label>
        {hint && <p className="toggle-row__hint">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
