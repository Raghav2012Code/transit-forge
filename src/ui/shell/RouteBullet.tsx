import type { TransportRoute } from '../../types/index.ts';

/**
 * The route bullet: the capsule you'd read off a platform sign. Every
 * reference to a line anywhere in the interface uses one, so a line is
 * recognised by its mark before its name is read.
 */

/** Route names lead with their code ("M1 Metro Blue"); fall back to initials. */
function routeCode(route: { id: string; name: string }): string {
  const lead = route.name.trim().split(/\s+/)[0];
  if (/^[A-Z]+\d+$/i.test(lead)) return lead.toUpperCase();
  return route.id.replace(/^rt-/, '').slice(0, 3).toUpperCase();
}

/** Strip the code off the front so the bullet isn't repeated in the label. */
function routeLabel(route: { id: string; name: string }): string {
  const code = routeCode(route);
  const rest = route.name.trim().replace(new RegExp(`^${code}\\s*`, 'i'), '');
  return rest || route.name;
}

/**
 * White text fails on a light line colour, so the bullet flips to ink —
 * the same reason a yellow line's bullet is set in black on a real sign.
 */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  // Contrast against white vs against ink, whichever is safer.
  return (1.05) / (lum + 0.05) >= (lum + 0.05) / 0.09 ? '#ffffff' : '#15181c';
}

export function RouteBullet({ route }: { route: Pick<TransportRoute, 'id' | 'name' | 'color'> }) {
  return (
    <span
      className="tf-bullet"
      style={{ background: route.color, color: textOn(route.color) }}
      aria-hidden="true"
    >
      {routeCode(route)}
    </span>
  );
}

/** A bullet plus the line's name, as one unit. */
export function RouteRef({
  route,
  onClick,
}: {
  route: Pick<TransportRoute, 'id' | 'name' | 'color'>;
  onClick?: () => void;
}) {
  const content = (
    <>
      <RouteBullet route={route} />
      <span>{routeLabel(route)}</span>
    </>
  );
  if (!onClick) return <span className="tf-route-ref">{content}</span>;
  return (
    <button type="button" className="tf-route-ref" onClick={onClick} title={route.name}>
      {content}
    </button>
  );
}
