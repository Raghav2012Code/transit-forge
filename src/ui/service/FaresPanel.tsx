import { MAX_FARE, type FarePolicy } from '../../simulation/economics/fares.ts';
import Dock from '../shell/Dock.tsx';
import Stepper from '../shell/Stepper.tsx';

interface Props {
  fares: FarePolicy;
  onFares: (fares: FarePolicy) => void;
}

/** One flat fare per mode, for the whole network. Applies to the running day at once. */
export default function FaresPanel({ fares, onFares }: Props) {
  return (
    <Dock title="Fares" meta="per trip, in OCU">
      <dl>
        <Stepper label="Metro fare" value={fares.metro} display={`${fares.metro} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...fares, metro: v })} />
        <Stepper label="Rail fare" value={fares.rail} display={`${fares.rail} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...fares, rail: v })} />
        <Stepper label="Bus fare" value={fares.bus} display={`${fares.bus} OCU`}
          min={0} max={MAX_FARE} onChange={(v) => onFares({ ...fares, bus: v })} />
      </dl>
      <p className="tf-hint">
        One ticket at the entry mode; transfers are free. Higher fares push riders
        to cars, and denied or unfinished trips earn nothing.
      </p>
    </Dock>
  );
}
