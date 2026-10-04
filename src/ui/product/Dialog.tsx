import { useState } from 'react';

/** Blocking confirmation for destructive actions. */
export function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="tf-modal-scrim" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="tf-modal">
        <h2>{title}</h2>
        <p className="tf-hint">{body}</p>
        <div className="tf-draft-actions">
          <button type="button" className="tf-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="tf-btn danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Single-field name entry (save-as, rename, duplicate naming). */
export function PromptDialog({ title, label, initial, confirmLabel = 'Save', onConfirm, onCancel }: {
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const valid = value.trim().length > 0;
  return (
    <div className="tf-modal-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="tf-modal">
        <h2>{title}</h2>
        <label className="tf-namelabel">
          {label}
          <input
            value={value}
            maxLength={48}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onConfirm(value.trim());
              if (e.key === 'Escape') onCancel();
            }}
            // Autofocus is scoped to this modal only.
            autoFocus
          />
        </label>
        <div className="tf-draft-actions">
          <button type="button" className="tf-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="tf-btn primary" disabled={!valid} onClick={() => onConfirm(value.trim())}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
