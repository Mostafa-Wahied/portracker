import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InternalPortDetails({ open, onOpenChange, containerId, serverId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shell, setShell] = useState("/bin/sh");
  const [copied, setCopied] = useState(false);
  const cmdRef = useRef(null);

  const guessShell = (image) => {
    const img = (image || "").toLowerCase();
    if (img.includes("alpine")) return "/bin/ash";
    if (
      img.includes("ubuntu") ||
      img.includes("debian") ||
      img.includes("fedora") ||
      img.includes("centos") ||
      img.includes("rocky") ||
      img.includes("rhel")
    )
      return "/bin/bash";
    return "/bin/sh";
  };

  useEffect(() => {
    if (!open || !containerId) return;
    setLoading(true);
    setError(null);
    const qs = serverId ? `?server_id=${encodeURIComponent(serverId)}` : "";
    fetch(`/api/containers/${encodeURIComponent(containerId)}/details${qs}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
      )
      .then((json) => {
        setData(json);
        try {
          setShell((prev) => prev || guessShell(json.image));
        } catch {
          setShell("/bin/sh");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, containerId, serverId]);

  const execTarget = data?.name || data?.id || containerId;
  const execCmd = `docker exec -it ${execTarget} ${shell}`;

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* Modern clipboard API not available or failed - will try fallback */
    }
    try {
      if (cmdRef.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cmdRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
        const ok = document.execCommand("copy");
        selection.removeAllRanges();
        if (ok) return true;
      }
    } catch {
      /* Legacy execCommand failed - will try textarea fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      ta.style.zIndex = "-1";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      /* Final fallback copy method also failed */
      return false;
    }
  }

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(execCmd);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200 dark:border-slate-800">
          <DialogTitle className="text-base">Container details</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Inspect details and access command.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {data && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 text-sm">
                  <div className="text-slate-500 dark:text-slate-400">Name</div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {data.name}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-slate-500 dark:text-slate-400">
                    Image
                  </div>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-900/40 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 truncate">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate inline-block max-w-full align-top">{data.image}</span>
                        </TooltipTrigger>
                        <TooltipContent>{data.image}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-slate-500 dark:text-slate-400">
                    State
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        data.state === "running"
                          ? "bg-green-500"
                          : data.state === "exited"
                          ? "bg-red-500"
                          : "bg-slate-400"
                      }`}
                    ></span>
                    <span className="font-medium capitalize">
                      {data.state || "unknown"}
                    </span>
                    {data.health && data.health !== "none" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-[10px] font-medium">
                        {data.health}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-[10px] font-medium">
                        no healthcheck
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-slate-500 dark:text-slate-400">
                    Network
                  </div>
                  <div className="font-medium">{data.networkMode}</div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Ports</h4>
                  <span className="text-xs text-slate-500">
                    {data.ports.length} mapping
                    {data.ports.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.ports.map((p, idx) => (
                      <li
                        key={idx}
                        className="px-3 py-2 text-sm flex items-center justify-between"
                      >
                        <div className="font-mono text-xs">
                          {p.internal ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[10px] font-medium">
                                internal
                              </span>
                              <span className="text-slate-600 dark:text-slate-300">
                                →
                              </span>
                              <span>
                                {p.container_port}/{p.protocol}
                              </span>
                            </span>
                          ) : (
                            <span>
                              {p.host_ip}:{p.host_port}{" "}
                              <span className="text-slate-500">→</span>{" "}
                              {p.container_port}/{p.protocol}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-2">Access tips</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                  Run a shell in the container:
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Shell</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                        >
                          {shell}
                          <ChevronDown className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-28">
                        {["/bin/ash", "/bin/bash", "/bin/dash", "/bin/sh"].map(
                          (s) => (
                            <DropdownMenuItem
                              key={s}
                              onSelect={() => setShell(s)}
                              className=""
                            >
                              {s}
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <pre ref={cmdRef} className="flex-1 text-xs bg-slate-950/95 dark:bg-slate-950 text-slate-100 rounded-md p-3 overflow-x-auto border border-slate-800">
                    {execCmd}
                  </pre>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={copied ? "Copied" : "Copy command"}
                          onClick={handleCopy}
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
