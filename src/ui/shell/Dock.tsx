import { useState, type ReactNode } from 'react';
import { IconChevron } from './icons.tsx';

interface Props {
  title: string;
  /** Right-aligned summary shown in the header (e.g. a headline number). */
  meta?: string;
  defaultOpen?: boolean;
  tone?: 'default' | 'alert';
  children: ReactNode;
}

/** Collapsible rail section. Keeps the console dense without hiding data. */
export default function Dock({ title, meta, defaultOpen = true, tone = 'default', children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`tf-dock${open ? ' open' : ''}${tone === 'alert' ? ' alert' : ''}`}>
      <button type="button" className="tf-dock-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconChevron className="tf-dock-caret" />
        <span className="tf-dock-title">{title}</span>
        {meta && <span className="tf-dock-meta">{meta}</span>}
      </button>
      {open && <div className="tf-dock-body">{children}</div>}
    </section>
  );
}