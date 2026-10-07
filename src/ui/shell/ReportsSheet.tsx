import type { ReactNode } from 'react';
import { IconClose } from './icons.tsx';
import Tabs, { type TabItem } from './Tabs.tsx';

export type ReportTab = 'network' | 'analysis' | 'growth' | 'compare';

const REPORT_TABS: readonly TabItem<ReportTab>[] = [
  { id: 'network', label: 'Network' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'growth', label: 'Growth' },
  { id: 'compare', label: 'Compare' },
];

interface Props {
  tab: ReportTab;
  onTab: (t: ReportTab) => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The numbers, with room to breathe. Panels written for a narrow column flow
 * into as many columns as the width allows, so a wide table is read at a
 * glance instead of scrolled past.
 */
export default function ReportsSheet({ tab, onTab, onClose, children }: Props) {
  return (
    <section id="tf-reports" className="tf-reports" aria-label="Reports">
      <header className="tf-reports-head">
        <Tabs tabs={REPORT_TABS} active={tab} onChange={onTab} label="Reports" idPrefix="reports" className="tf-tabs inline" />
        <button type="button" className="tf-btn icon ghost" onClick={onClose} aria-label="Close reports" title="Close reports (S)">
          <IconClose />
        </button>
      </header>
      <div
        className="tf-reports-body"
        role="tabpanel"
        id={`reportspanel-${tab}`}
        aria-labelledby={`reportstab-${tab}`}
        tabIndex={0}
      >
        <div className="tf-reports-cols">{children}</div>
      </div>
    </section>
  );
}
