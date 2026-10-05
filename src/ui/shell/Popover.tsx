import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface PopoverTriggerProps {
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'dialog';
  'aria-controls': string;
}

interface Props {
  /** Renders the button that opens it. Spread the props onto a real <button>. */
  trigger: (props: PopoverTriggerProps, open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Accessible name of the popover. */
  label: string;
  align?: 'start' | 'end';
  placement?: 'below' | 'above';
  className?: string;
}

/**
 * A small anchored surface for things that do not deserve permanent space:
 * layers, extra lenses, saved scenarios. Closes on outside press and Escape,
 * and Escape stops here instead of also leaving the current mode.
 */
export default function Popover({ trigger, children, label, align = 'start', placement = 'below', className }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className={`tf-popover${className ? ` ${className}` : ''}`} ref={wrap}>
      {trigger(
        { onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-controls': id },
        open,
      )}
      {open && (
        <div
          id={id}
          ref={panel}
          className={`tf-popover-panel ${align} ${placement}`}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
