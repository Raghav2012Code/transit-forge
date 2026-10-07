import { MAX_TRIP_ROWS, type TripKind, type TripRow } from './trips.ts';

interface Props {
  rows: TripRow[];
  onOpen: (id: number, kind: TripKind) => void;
  /** Said when there is nothing to list. */
  empty: string;
}

/** A short list of trips. Each row opens that trip's card. */
export default function TripList({ rows, onOpen, empty }: Props) {
  if (rows.length === 0) return <p className="tf-hint">{empty}</p>;
  const shown = rows.slice(0, MAX_TRIP_ROWS);
  return (
    <>
      <ul className="tf-trip-list">
        {shown.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <button type="button" className="tf-trip" onClick={() => onOpen(r.id, r.kind)}>
              <span className="tf-trip-label">{r.label}</span>
              <span className={`tf-trip-hint${r.tone === 'neutral' ? '' : ` ${r.tone}`}`}>{r.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <p className="tf-hint">+{rows.length - shown.length} more</p>}
    </>
  );
}
