import type { TabItem } from './Tabs.tsx';

export type ReportTab = 'network' | 'analysis' | 'growth' | 'compare';

export const REPORT_TABS: readonly TabItem<ReportTab>[] = [
  { id: 'network', label: 'Network' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'growth', label: 'Growth' },
  { id: 'compare', label: 'Compare' },
];
