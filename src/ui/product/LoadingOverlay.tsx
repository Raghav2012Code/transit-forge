export interface LoadStage {
  label: string;
  /** 0..1 fraction within the whole job. */
  progress: number;
}

interface Props {
  title: string;
  stage: LoadStage;
}

/** Staged loading with real progress — shown for scenario restores only. */
export default function LoadingOverlay({ title, stage }: Props) {
  const pct = Math.round(stage.progress * 100);
  return (
    <div className="tf-modal-scrim" role="status" aria-label={`${title}: ${stage.label}`}>
      <div className="tf-modal tf-load-modal">
        <h2>{title}</h2>
        <p className="tf-hint">{stage.label}… {pct}%</p>
        <div className="tf-bar-track" aria-hidden="true">
          <div className="tf-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
