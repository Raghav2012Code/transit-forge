// Shared SVG chart primitives (no charting dependency).
export function Line({ values, color, height = 64 }: { values: number[]; color: string; height?: number }) {
  const w = 260;
  const max = Math.max(0.001, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${height - 4 - (v / max) * (height - 10)}`).join(' ');
  return (
    <svg width={w} height={height} className="tf-chart">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function Bars({ values, color }: { values: { label: string; value: number }[]; color: string }) {
  const max = Math.max(0.001, ...values.map((v) => v.value));
  return (
    <div className="tf-bars">
      {values.map((v) => (
        <div key={v.label} className="tf-bar-row">
          <span>{v.label}</span>
          <div className="tf-bar-track">
            <div className="tf-bar-fill" style={{ width: `${(v.value / max) * 100}%`, background: color }} />
          </div>
          <span>{v.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
