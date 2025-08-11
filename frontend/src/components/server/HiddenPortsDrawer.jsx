import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function HiddenPortsDrawer({ hiddenPorts, onUnhide, serverId }) {
  if (hiddenPorts.length === 0) return null;

  return (
    <div className="p-4">
      <details className="group">
        <summary className="flex items-center cursor-pointer text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
          <EyeOff className="w-4 h-4 mr-2" />
          <span>Hidden Ports ({hiddenPorts.length})</span>
          <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-3 space-y-2 pl-6 border-l border-slate-200 dark:border-slate-700 ml-2">
          {hiddenPorts.map((p) => (
            <li
              key={`${serverId}-${p.host_ip}-${p.host_port}-hidden`}
              className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md"
            >
              <div className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-mono">{p.host_port}</span> —{" "}
                <span className="truncate">{p.owner}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onUnhide(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Unhide port</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
