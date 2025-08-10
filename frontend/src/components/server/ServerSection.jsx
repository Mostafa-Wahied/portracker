import React, { useMemo, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  List,
  Grid3x3,
  Table,
  Network,
  Activity,
  ArrowDownUp,
  HardDrive,
  Server as VmIcon,
  LayoutGrid,
  Rows,
  Info,
} from "lucide-react";
import { PortCard } from "./PortCard";
import { PortGridItem } from "./PortGridItem";
import { PortTable } from "./PortTable";
import { HiddenPortsDrawer } from "./HiddenPortsDrawer";
import { SystemInfoCard } from "./SystemInfoCard";
import Logger from "../../lib/logger";
import { VMsCard } from "./VMsCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Renders a comprehensive server overview section, including system information, virtual machines, and port management with sorting, filtering, and multiple layout options.
 *
 * Displays server status, host details, and provides interactive controls for sorting and viewing ports in list, grid, card, or table formats. Allows toggling between expanded and collapsed views, managing hidden ports, and switching layouts for system info and VMs. Handles user actions such as copying, editing notes, and toggling port visibility.
 */
function ServerSectionComponent({
  server,
  ok,
  data,
  id,
  searchTerm,
  actionFeedback,
  onNote,
  onToggleIgnore,
  onCopy,
  serverUrl,
  platformName,
  systemInfo,
  vms,
  portLayout,
  onPortLayoutChange,
  isExpanded,
  onToggleExpanded,
  openAccordionItems,
  onAccordionChange,
  infoCardLayout,
  onInfoCardLayoutChange,
}) {
  // Initialize logger for ServerSection component
  const logger = useMemo(() => new Logger('ServerSection'), []);
  
  const [sortConfig, setSortConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("portSortConfig");
      return saved
        ? JSON.parse(saved)
        : { key: "default", direction: "ascending" };
    } catch {
      return { key: "default", direction: "ascending" };
    }
  });

  const visiblePorts = useMemo(
    () => (data ? data.filter((p) => !p.ignored) : []),
    [data]
  );
  const hiddenPorts = useMemo(
    () => (data ? data.filter((p) => p.ignored) : []),
    [data]
  );

  // Safety net: sanitize bad saved sort configs on mount
  useEffect(() => {
    const validKeys = ["default", "host_port", "owner", "created"];
    let { key, direction } = sortConfig;
    let changed = false;
    if (!validKeys.includes(key)) {
      key = "default";
      direction = "ascending";
      changed = true;
    }
    if (direction !== "ascending" && direction !== "descending") {
      direction = "ascending";
      changed = true;
    }
    if (changed) setSortConfig({ key, direction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedPorts = useMemo(() => {
    let sortablePorts = [...visiblePorts];

    if (sortConfig.key === "default") {
      return sortablePorts;
    }

    const asc = sortConfig.direction === "ascending";
    const normalizeForSort = (val) => {
      if (val == null) return "";
      if (Array.isArray(val)) return val.join(", ");
      if (typeof val === "number") return String(val);
      return String(val);
    };

    if (sortConfig.key) {
      sortablePorts.sort((a, b) => {
        // Numeric sorts
        if (sortConfig.key === "host_port") {
          const portA = parseInt(a.host_port, 10) || 0;
          const portB = parseInt(b.host_port, 10) || 0;
          return asc ? portA - portB : portB - portA;
        }
        if (sortConfig.key === "created") {
          const aNum = Number(a.created ?? 0);
          const bNum = Number(b.created ?? 0);
          return asc ? aNum - bNum : bNum - aNum;
        }

        // Safe string sort
        const valA = normalizeForSort(a[sortConfig.key]).toLowerCase();
        const valB = normalizeForSort(b[sortConfig.key]).toLowerCase();

        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }
    return sortablePorts;
  }, [visiblePorts, sortConfig]);

  useEffect(() => {
    try {
      localStorage.setItem("portSortConfig", JSON.stringify(sortConfig));
    } catch (error) {
      logger.warn("Failed to save sort config:", error);
    }
  }, [logger, sortConfig]);

  const getSortDisplayName = (key) => {
    switch (key) {
      case "default":
        return "Default";
      case "host_port":
        return "Port";
      case "owner":
        return "Service";
      default:
        return key.charAt(0).toUpperCase() + key.slice(1);
    }
  };

  const portsToDisplay =
    isExpanded || portLayout === "grid" ? sortedPorts : sortedPorts.slice(0, 8);

  const hasSystemInfo = systemInfo && Object.keys(systemInfo).length > 0;
  const hasVMs = vms && vms.length > 0;

  const getHostDisplay = () => {
    // For local server, use the current window's host (where the app is running)
    if (!serverUrl) {
      return window.location.host || "localhost";
    }
    
    try {
      const url = new URL(
        serverUrl.startsWith("http") ? serverUrl : `http://${serverUrl}`
      );
      return (
        url.hostname +
        (url.port && url.port !== "80" && url.port !== "443"
          ? `:${url.port}`
          : "")
      );
    } catch {
      return serverUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "localhost";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 truncate">
              {server}
            </h1>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                ok
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              <Activity className="h-4 w-4 mr-1.5" />
              {ok ? "Online" : "Offline"}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
            {getHostDisplay()}
          </p>
        </div>
      </div>

      {(hasSystemInfo || hasVMs) && (
        <div>
          <div className="flex items-center justify-end mb-4">
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
              <button
                onClick={() => onInfoCardLayoutChange("grid")}
                className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                  infoCardLayout === "grid"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                title="Grid Layout"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onInfoCardLayoutChange("stacked")}
                className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                  infoCardLayout === "stacked"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                title="Stacked Layout"
              >
                <Rows className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Accordion
            type="multiple"
            className={`w-full ${
              infoCardLayout === "grid"
                ? "grid grid-cols-1 lg:grid-cols-2 gap-6"
                : "space-y-6"
            }`}
            value={openAccordionItems}
            onValueChange={onAccordionChange}
          >
            {hasSystemInfo && (
              <AccordionItem
                value="system-info"
                className="border rounded-xl bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50 shadow-sm"
              >
                <AccordionTrigger className="px-6 py-4 text-lg font-semibold text-slate-900 dark:text-slate-100 hover:no-underline">
                  <div className="flex items-center">
                    <Info className="h-5 w-5 mr-3 text-slate-600 dark:text-slate-400" />
                    System Information
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <SystemInfoCard
                    systemInfo={systemInfo}
                    platformName={platformName}
                  />
                </AccordionContent>
              </AccordionItem>
            )}
            {hasVMs && (
              <AccordionItem
                value="vms"
                className="border rounded-xl bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50 shadow-sm"
              >
                <AccordionTrigger className="px-6 py-4 text-lg font-semibold text-slate-900 dark:text-slate-100 hover:no-underline">
                  <div className="flex items-center">
                    <VmIcon className="h-5 w-5 mr-3 text-slate-600 dark:text-slate-400" />
                    Virtual Machines ({vms.length})
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <VMsCard vms={vms} />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      )}

      {/* Ports Section Card */}
      <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center">
              <Network className="h-5 w-5 mr-2 text-slate-600 dark:text-slate-400" />
              Ports
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                ({visiblePorts.length})
              </span>
            </h2>
            <div className="flex items-center justify-start sm:justify-end flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center px-2 sm:px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <ArrowDownUp className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Sort By:&nbsp;</span>
                    {getSortDisplayName(sortConfig.key)}
                    {sortConfig.key !== "default" && (
                      <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                        ({sortConfig.direction === "ascending" ? "Asc" : "Desc"}
                        )
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({ key: "default", direction: "ascending" })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "default"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Default Order
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({
                        key: "host_port",
                        direction: "ascending",
                      })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "host_port" &&
                        sortConfig.direction === "ascending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Port (Asc)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({
                        key: "host_port",
                        direction: "descending",
                      })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "host_port" &&
                        sortConfig.direction === "descending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Port (Desc)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({ key: "owner", direction: "ascending" })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "owner" &&
                        sortConfig.direction === "ascending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Service (A-Z)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({ key: "owner", direction: "descending" })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "owner" &&
                        sortConfig.direction === "descending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Service (Z-A)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({ key: "created", direction: "ascending" })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "created" &&
                        sortConfig.direction === "ascending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Created (Oldest)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortConfig({ key: "created", direction: "descending" })
                    }
                  >
                    <span
                      className={
                        sortConfig.key === "created" &&
                        sortConfig.direction === "descending"
                          ? "font-medium text-blue-600"
                          : ""
                      }
                    >
                      Created (Newest)
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => onPortLayoutChange("list")}
                  className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                    portLayout === "list"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onPortLayoutChange("grid")}
                  className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                    portLayout === "grid"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                  title="Grid view"
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onPortLayoutChange("table")}
                  className={`p-1.5 sm:p-2 rounded-md transition-colors ${
                    portLayout === "table"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                  title="Table view"
                >
                  <Table className="h-4 w-4" />
                </button>
              </div>
              {sortedPorts.length > 8 && portLayout !== "grid" && (
                <button
                  onClick={onToggleExpanded}
                  className="inline-flex items-center px-2 sm:px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 mr-1" />
                  ) : (
                    <ChevronDown className="h-4 w-4 mr-1" />
                  )}
                  <span className="hidden sm:inline">
                    {isExpanded
                      ? "Show Less"
                      : `Show All (${sortedPorts.length})`}
                  </span>
                  <span className="sm:hidden">
                    {isExpanded ? "Less" : "All"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {ok && visiblePorts.length > 0 && (
          <div>
            {portLayout === "list" && (
              <ul className="space-y-2">
                {portsToDisplay.map((port) => (
                  <PortCard
                    key={
                      port.internal
                        ? `${id}-${port.container_id || port.app_id}-${port.host_port}-internal`
                        : `${id}-${port.host_ip}-${port.host_port}`
                    }
                    port={port}
                    itemKey={
                      port.internal
                        ? `${id}-${port.container_id || port.app_id}-${port.host_port}-internal`
                        : `${id}-${port.host_ip}-${port.host_port}`
                    }
                    searchTerm={searchTerm}
                    actionFeedback={actionFeedback}
                    onCopy={onCopy}
                    onEdit={onNote}
                    onToggleIgnore={onToggleIgnore}
                    serverId={id}
                    serverUrl={serverUrl}
                  />
                ))}
              </ul>
            )}

            {portLayout === "card" && (
              <ul className="space-y-2">
                {portsToDisplay.map((port) => (
                  <PortCard
                    key={
                      port.internal
                        ? `${id}-${port.container_id || port.app_id}-${port.host_port}-internal`
                        : `${id}-${port.host_ip}-${port.host_port}`
                    }
                    port={port}
                    itemKey={
                      port.internal
                        ? `${id}-${port.container_id || port.app_id}-${port.host_port}-internal`
                        : `${id}-${port.host_ip}-${port.host_port}`
                    }
                    searchTerm={searchTerm}
                    actionFeedback={actionFeedback}
                    onCopy={onCopy}
                    onEdit={onNote}
                    onToggleIgnore={onToggleIgnore}
                    serverId={id}
                    serverUrl={serverUrl}
                  />
                ))}
              </ul>
            )}

            {portLayout === "grid" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {portsToDisplay.map((port) => (
                  <PortGridItem
                    key={
                      port.internal
                        ? `${id}-${port.container_id || port.app_id}-${port.host_port}-internal`
                        : `${id}-${port.host_ip}-${port.host_port}`
                    }
                    port={port}
                    searchTerm={searchTerm}
                    actionFeedback={actionFeedback}
                    onCopy={onCopy}
                    onNote={onNote}
                    onToggleIgnore={onToggleIgnore}
                    serverId={id}
                    serverUrl={serverUrl}
                  />
                ))}
              </div>
            )}
            {portLayout === "table" && (
              <PortTable
                ports={portsToDisplay}
                serverId={id}
                serverUrl={serverUrl}
                searchTerm={searchTerm}
                actionFeedback={actionFeedback}
                onCopy={onCopy}
                onNote={onNote}
                onToggleIgnore={onToggleIgnore}
                sortConfig={sortConfig}
                onSort={(key) =>
                  setSortConfig((prev) => ({
                    key,
                    direction:
                      prev.key === key && prev.direction === "ascending"
                        ? "descending"
                        : "ascending",
                  }))
                }
              />
            )}

            {!isExpanded && sortedPorts.length > 8 && portLayout !== "grid" && (
              <div className="p-4 text-center border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={onToggleExpanded}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                >
                  + {sortedPorts.length - 8} more ports
                </button>
              </div>
            )}
          </div>
        )}

        {ok && visiblePorts.length === 0 && (
          <div className="p-6 text-center text-slate-500 dark:text-slate-400">
            No ports detected or all ports are hidden.
          </div>
        )}

        {!ok && (
          <div className="p-6 text-center text-red-500 dark:text-red-400">
            Server is offline or API is not reachable.
          </div>
        )}

        {hiddenPorts.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700/50">
            <HiddenPortsDrawer
              hiddenPorts={hiddenPorts}
              onUnhide={(p) => onToggleIgnore(id, p)}
              serverId={id}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const ServerSection = React.memo(ServerSectionComponent);
