import { useEffect, useRef, Fragment } from 'react';
import { IconClose } from './icons.tsx';
import { SHORTCUT_GROUPS } from './shortcuts.ts';

interface Props {
  version: string;
  seed: number;
  onClose: () => void;
}

/** Keyboard shortcuts and a line about the build, one keypress away (?). */
export default function HelpSheet({ version, seed, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  // Kept current in an effect, not during render: a fresh inline onClose from
  // the parent must not re-run the effect below and yank focus onto the dialog.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="tf-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tf-help" role="dialog" aria-modal="true" aria-labelledby="tf-help-title" ref={panel} tabIndex={-1}>
        <header className="tf-help-head">
          <h2 id="tf-help-title">Keyboard shortcuts</h2>
          <button type="button" className="tf-btn icon ghost" onClick={onClose} aria-label="Close shortcuts">
            <IconClose />
          </button>
        </header>
        <div className="tf-help-body">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title} className="tf-help-group">
              <h3>{g.title}</h3>
              <dl className="tf-keys">
                {g.items.map(([keys, does]) => (
                  <Fragment key={does}>
                    <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                    <dd>{does}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer className="tf-help-foot">
          TransitForge {version}. The city is generated from seed {seed}, so the same edits give the same day.
        </footer>
      </div>
    </div>
  );
}
