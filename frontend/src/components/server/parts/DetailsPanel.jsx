import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function DetailsPanel({ title, children, icon, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-t-lg"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 text-xs">{children}</div>}
    </div>
  );
}
