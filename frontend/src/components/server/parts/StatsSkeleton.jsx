import React from 'react';
export function StatsSkeleton() {
  const item = (w) => (
    <div className="h-3 rounded bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" style={{width: w}} />
  );
  return (
    <div className="grid grid-cols-2 gap-2 font-mono text-[11px] select-none" aria-hidden="true">
      <div className="flex flex-col gap-1">{item('70%')}{item('55%')}</div>
      <div className="flex flex-col gap-1">{item('65%')}{item('50%')}</div>
    </div>
  );
}

export default StatsSkeleton;
