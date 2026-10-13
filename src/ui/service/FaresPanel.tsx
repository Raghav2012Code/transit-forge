import { useState } from 'react';
import { MAX_FARE, type FarePolicy } from '../../simulation/economics/fares.ts';
import Dock from '../shell/Dock.tsx';
import Stepper from '../shell/Stepper.tsx';

interface Props {
  fares: FarePolicy;
  nowMin: number;
  onFares: (fares: FarePolicy, atMin?: number) => void;
}

/** One flat fare per mode, for the whole network. Applies to the running day at once. */
export default function FaresPanel({ fares, nowMin, onFares }: Props) {
  const [effFrom, setEffFrom] = useState(() => Math.floor(nowMin));
  const send = (f: FarePolicy) => onFares(f, effFrom);
  return (
    <Dock title="Fares" meta="per trip, in OCU">
      <label className="tf-namelabel">
        Effective from (min)
        <input type="number" min={0} max={1439} value={effFrom} onChange={(e) => {
          const v = Math.floor(Number(e.target.value));
          setEffFrom(Number.isFinite(v) ? Math.min(1439, Math.max(0, v)) : 0);
        }} />
      </label>
      <dl>
        <Stepper label="Metro fare" value={fares.metro} display={`${fares.metro} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => send({ ...fares, metro: v })} />
        <Stepper label="Rail fare" value={fares.rail} display={`${fares.rail} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => send({ ...fares, rail: v })} />
        <Stepper label="Bus fare" value={fares.bus} display={`${fares.bus} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => send({ ...fares, bus: v })} />
      </dl>
      <p className="tf-hint">
        One ticket at the entry mode; transfers are free. Higher fares push riders
        to cars, and denied or unfinished trips earn nothing.
      </p>
    </Dock>
  );
}
