export interface Toast {
  id: number;
  level: 'info' | 'warn' | 'good';
  text: string;
  time: string;
}

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="tf-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`tf-toast${t.level === 'info' ? '' : ` ${t.level}`}`}>
          <span className="tf-toast-time">{t.time}</span>
          <span className="tf-toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}