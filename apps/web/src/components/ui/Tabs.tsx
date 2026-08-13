'use client';

import {useState, type ReactNode} from 'react';
import {cn} from '@/lib/utils';

export interface TabItem {
  key: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value?: string;
  onChange?: (key: string) => void;
  className?: string;
}

/** Tabs accesibles (role=tablist / tab / tabpanel-implícito). */
export function Tabs({tabs, value, onChange, className}: TabsProps): React.JSX.Element {
  const [internal, setInternal] = useState(tabs[0]?.key);
  const active = value ?? internal;

  const select = (key: string) => {
    if (value === undefined) setInternal(key);
    onChange?.(key);
  };

  return (
    <div
      role="tablist"
      aria-label="Pestañas"
      className={cn('inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onClick={() => select(tab.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring',
              selected ? 'bg-brand text-brand-fg' : 'text-content-secondary hover:bg-surface-muted',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
