import type { TransportRoute } from '../../types/index.ts';
import { textOn } from './bulletInk.ts';

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
