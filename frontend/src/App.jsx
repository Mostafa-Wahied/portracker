import React, { useEffect, useState, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppHeader } from "./components/layout/AppHeader";
import { ServerSection } from "./components/server/ServerSection";
import { Sidebar } from "./components/layout/Sidebar";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { MultipleServerSkeleton } from "./components/server/MultipleServerSkeleton";
import { BarChart3 } from "lucide-react";
import Logger from "./lib/logger";

const keyOf = (srvId, p) => `${srvId}-${p.host_ip}-${p.host_port}`;

// Initialize logger for App component
const logger = new Logger('App');

/**
 * Main React component for the server and port monitoring dashboard.
 *
 * Manages state, data fetching, transformation, and user interactions for displaying and managing servers and their network ports. Handles UI preferences, filtering, searching, note editing, port ignoring, server addition and deletion, and clipboard actions. Synchronizes relevant state with localStorage and supports auto-refresh and error fallback mechanisms.
 *
 * @return {JSX.Element} The rendered dashboard application.
 */
export default function App() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [modalSrvId, setModalSrvId] = useState("");
  const [modalPort, setModalPort] = useState(null);
  const [draftNote, setDraftNote] = useState("");

  const [actionFeedback, setActionFeedback] = useState({
    copy: null,
    edit: null,
    hide: null,
    unhide: null,
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (localStorage.theme === "dark") {
      return true;
    }
    if (localStorage.theme === "light") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(
    () => localStorage.getItem("selectedServerId") || null
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [searchHighlighting, setSearchHighlighting] = useState(() => {
    try {
      const saved = localStorage.getItem("searchHighlighting");
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem("portFilters");
      return saved
        ? JSON.parse(saved)
        : {
            docker: true,
            system: false,
          };
    } catch {
      return {
        docker: true,
        system: false,
      };
    }
  });

  const [expandedServers, setExpandedServers] = useState(() => {
    try {
      const saved = localStorage.getItem("expandedServers");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [openAccordions, setOpenAccordions] = useState(() => {
    try {
      const saved = localStorage.getItem("openAccordions");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [infoCardLayout, setInfoCardLayout] = useState(() => {
    try {
      const saved = localStorage.getItem("infoCardLayout");
      return saved || "grid";
    } catch {
      return "grid";
    }
  });

  const [portLayout, setPortLayout] = useState(() => {
    try {
      const saved = localStorage.getItem("portLayout");
      return saved || "list";
    } catch {
      return "list";
    }
  });

  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.theme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.theme = "light";
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem("portFilters", JSON.stringify(filters));
    } catch (error) {
      logger.warn("Failed to save filter settings:", error);
    }
  }, [filters]);

  useEffect(() => {
    try {
      localStorage.setItem("expandedServers", JSON.stringify(expandedServers));
    } catch (error) {
      logger.warn("Failed to save expanded servers state:", error);
    }
  }, [expandedServers]);

  useEffect(() => {
    try {
      localStorage.setItem("openAccordions", JSON.stringify(openAccordions));
    } catch (error) {
      logger.warn("Failed to save open accordions state:", error);
    }
  }, [openAccordions]);

  useEffect(() => {
    try {
      localStorage.setItem("infoCardLayout", infoCardLayout);
    } catch (error) {
      logger.warn("Failed to save info card layout setting:", error);
    }
  }, [infoCardLayout]);

  useEffect(() => {
    try {
      localStorage.setItem("portLayout", portLayout);
    } catch (error) {
      logger.warn("Failed to save port layout setting:", error);
    }
  }, [portLayout]);

  useEffect(() => {
    if (selectedServer) {
      localStorage.setItem("selectedServerId", selectedServer);
    } else {
      localStorage.removeItem("selectedServerId");
    }
  }, [selectedServer]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "searchHighlighting",
        JSON.stringify(searchHighlighting)
      );
    } catch (error) {
      logger.warn("Failed to save search highlighting setting:", error);
    }
  }, [searchHighlighting]);

  const handleSelectServer = useCallback((serverId) => {
    setSelectedServer(serverId);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const toggleServerExpanded = useCallback((serverId) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverId]: !prev[serverId],
    }));
  }, []);

  const handleAccordionChange = useCallback((serverId, openItems) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [serverId]: openItems,
    }));
  }, []);

  const transformCollectorData = useCallback(
    async (collectorData, serverId) => {
      if (!collectorData.ports || !Array.isArray(collectorData.ports)) {
        logger.warn(
          `transformCollectorData: No ports array in collectorData for serverId ${serverId}`,
          collectorData
        );
        return [];
      }

      const transformedPorts = collectorData.ports
        .filter((port) => {
          if (
            port.host_ip &&
            (port.host_ip.includes("::") || port.host_ip === "[::]")
          ) {
            return false;
          }
          if (!port.host_port || port.host_port <= 0) return false;
          return true;
        })
        .map((port) => ({
          source: port.source || null,
          owner: port.owner || null,
          protocol: port.protocol || null,
          host_ip: port.host_ip || null,
          host_port: port.host_port || null,
          target: port.target || null,
          container_id: port.container_id || null,
          vm_id: port.vm_id || null,
          app_id: port.app_id || null,
          note: port.note || null,
          ignored: !!port.ignored,
          created: port.created || null,
          internal: port.internal || false,
        }));

      const uniquePorts = [];
      const seenKeys = new Set();

      transformedPorts.forEach((port) => {
        const key = port.internal 
          ? `${port.container_id || port.app_id}:${port.host_port}:internal`
          : `${port.host_ip}:${port.host_port}:${port.owner}`;      
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniquePorts.push(port);
        } else {
          logger.debug(`DUPLICATE DETECTED - Filtering out port with key: ${key}`, port);
        }
      });

      const groupMap = new Map();

      uniquePorts.forEach((port) => {
        if (port.source === "docker") {
          const groupKey = port.container_id || port.app_id || port.owner;
          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, []);
          }
          groupMap.get(groupKey).push(port);
        } else {
          const uniqueKey = `${port.source}-${port.host_ip}-${port.host_port}-${
            port.owner
          }-${port.pid || Math.random()}`;
          groupMap.set(uniqueKey, [port]);
        }
      });

      const portsWithGroupInfo = [];

      groupMap.forEach((portsInGroup) => {
        portsInGroup.sort((a, b) => a.host_port - b.host_port);

        portsInGroup.forEach((port, index) => {
          portsWithGroupInfo.push({
            ...port,
            groupId:
              port.source === "docker"
                ? port.container_id || port.app_id || port.owner
                : `${port.source}-${port.host_ip}-${port.host_port}-${
                    port.owner
                  }-${port.pid || Math.random()}`,
            groupIndex: index,
            groupCount: portsInGroup.length,
            groupSiblings: portsInGroup.map(
              (p) => `${p.host_ip}:${p.host_port}`
            ),
          });
        });
      });

      logger.debug(
        `Final result: Transformed ${collectorData.ports.length} raw ports into ${portsWithGroupInfo.length} unique valid ports with grouping`
      );
      return portsWithGroupInfo;
    },
    []
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const serversResponse = await fetch("/api/servers");
      if (!serversResponse.ok) {
        throw new Error(`Failed to fetch servers: ${serversResponse.status}`);
      }
      const currentServers = await serversResponse.json();

      const enrichedServers = await Promise.all(
        currentServers.map(async (server) => {
          if (server.id === "local") {
            try {
              const scanResponse = await fetch(
                `/api/servers/${server.id}/scan`
              );
              if (scanResponse.ok) {
                const scanData = await scanResponse.json();
                const transformedPorts = await transformCollectorData(
                  scanData,
                  server.id
                );
                return {
                  id: server.id,
                  server: server.label,
                  ok: true,
                  platform: scanData.platform,
                  platformName: scanData.platformName,
                  data: transformedPorts,
                  systemInfo: scanData.systemInfo,
                  applications: scanData.applications,
                  vms: scanData.vms,
                  parentId: server.parentId,
                  platform_type: server.platform_type || scanData.platform,
                  enhancedFeaturesEnabled: true,
                };
              } else {
                const errorData = await scanResponse
                  .json()
                  .catch(() => ({
                    error: `Local scan failed with status ${scanResponse.status}`,
                  }));
                logger.warn(
                  `Local scan API for ${server.id} failed:`,
                  errorData.error
                );
                return {
                  id: server.id,
                  server: server.label,
                  ok: false,
                  error: errorData.error || "Local server data unavailable",
                  data: [],
                  parentId: server.parentId,
                  platform_type: server.platform_type || "unknown",
                };
              }
            } catch (error) {
              logger.error("Error scanning local server:", error);
              return {
                id: server.id,
                server: server.label,
                ok: false,
                error: error.message,
                data: [],
                parentId: server.parentId,
                platform_type: server.platform_type || "unknown",
              };
            }
          }

          if (server.type === "peer" && server.url) {
            try {
              const scanResponse = await fetch(
                `/api/servers/${server.id}/scan`
              );
              if (scanResponse.ok) {
                const scanData = await scanResponse.json();
                const transformedPorts = await transformCollectorData(
                  scanData,
                  server.id
                );
                return {
                  id: server.id,
                  server: server.label,
                  ok: true,
                  url: server.url,
                  platform: scanData.platform,
                  platformName: scanData.platformName,
                  data: transformedPorts,
                  systemInfo: scanData.systemInfo,
                  applications: scanData.applications,
                  vms: scanData.vms,
                  parentId: server.parentId,
                  platform_type: server.platform_type || scanData.platform,
                  enhancedFeaturesEnabled: true,
                };
              } else {
                const errorData = await scanResponse.json().catch(() => ({
                  error: `Failed to scan peer '${server.label}' via backend. Status: ${scanResponse.status}`,
                }));
                logger.warn(
                  `Failed to scan peer ${server.id} (${server.label}):`,
                  errorData.details || errorData.error
                );
                return {
                  id: server.id,
                  server: server.label,
                  ok: false,
                  error:
                    errorData.details ||
                    errorData.error ||
                    `Scan failed (status ${scanResponse.status})`,
                  data: [],
                  parentId: server.parentId,
                  platform_type: server.platform_type || "unknown",
                };
              }
            } catch (error) {
              logger.error(
                `Error fetching scan for peer ${server.id} (${server.label}):`,
                error
              );
              return {
                id: server.id,
                server: server.label,
                ok: false,
                error: `Network error fetching scan: ${error.message}`,
                data: [],
                parentId: server.parentId,
                platform_type: server.platform_type || "unknown",
              };
            }
          }

          return {
            id: server.id,
            server: server.label,
            ok: false,
            error: "Server type not scannable or misconfigured",
            data: [],
            parentId: server.parentId,
            platform_type: server.platform_type || "unknown",
          };
        })
      );

      setGroups(enrichedServers);
      setTimeout(() => setLoading(false), 300);
    } catch (error) {
      logger.error("Error in fetchAll:", error);

      try {
        logger.warn(
          "Primary fetch failed, attempting complete fallback to legacy API"
        );
        const fallbackResponse = await fetch("/api/all-ports");
        if (fallbackResponse.ok) {
          const legacyData = await fallbackResponse.json();
          setGroups(legacyData);
          setTimeout(() => setLoading(false), 300);
          return;
        }
      } catch (fallbackError) {
        logger.error("Even fallback API failed:", fallbackError);
      }

      setError(error.toString());
      setLoading(false);
    }
  }, [transformCollectorData]);

  const handleLogoClick = useCallback(() => {
    fetchAll();
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!loading && groups.length > 0) {
      const selectionIsValid =
        selectedServer && groups.some((g) => g.id === selectedServer);
      if (!selectionIsValid) {
        setSelectedServer(groups[0].id);
      }
    } else if (!loading && groups.length === 0 && selectedServer) {
      setSelectedServer(null);
    }
  }, [groups, loading, selectedServer]);

  const toggleIgnore = useCallback(
    (srvId, p) => {
      const newIgnoredState = !p.ignored;

      setGroups((currentGroups) =>
        currentGroups.map((group) => {
          if (group.id === srvId) {
            const updatedData = group.data.map((port) => {
              if (
                port.host_ip === p.host_ip &&
                port.host_port === p.host_port
              ) {
                return { ...port, ignored: newIgnoredState };
              }
              return port;
            });
            return { ...group, data: updatedData };
          }
          return group;
        })
      );

      let targetUrl = "/api/ignores";
      let isPeer = false;

      if (srvId !== "local") {
        const server = servers.find((s) => s.id === srvId);
        if (server && server.url) {
          targetUrl = `${server.url.replace(/\/+$/, "")}/api/ignores`;
          isPeer = true;
        }
      }

      fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: isPeer ? "local" : srvId,
          host_ip: p.host_ip,
          host_port: p.host_port,
          ignored: newIgnoredState,
        }),
      })
        .then((response) => {
          if (!response.ok)
            throw new Error("Failed to update ignore status on backend.");
        })
        .catch((error) => {
          logger.error("Error toggling ignore:", error);
          setGroups((currentGroups) =>
            currentGroups.map((group) => {
              if (group.id === srvId) {
                const revertedData = group.data.map((port) => {
                  if (
                    port.host_ip === p.host_ip &&
                    port.host_port === p.host_port
                  ) {
                    return { ...port, ignored: p.ignored };
                  }
                  return port;
                });
                return { ...group, data: revertedData };
              }
              return group;
            })
          );
        });
    },
    [servers]
  );

  const openNoteModal = useCallback((srvId, p) => {
    setModalSrvId(srvId);
    setModalPort(p);
    setDraftNote(p.note || "");
    setNoteModalOpen(true);
  }, []);

  const saveNote = useCallback(() => {
    if (!modalPort) return;
    const originalNote = modalPort.note || "";

    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id === modalSrvId) {
          const updatedData = group.data.map((port) => {
            if (
              port.host_ip === modalPort.host_ip &&
              port.host_port === modalPort.host_port
            ) {
              return { ...port, note: draftNote };
            }
            return port;
          });
          return { ...group, data: updatedData };
        }
        return group;
      })
    );
    setNoteModalOpen(false);

    let targetUrl = "/api/notes";
    let isPeer = false;
    const currentServerIdForNote = modalSrvId;

    if (currentServerIdForNote !== "local") {
      const server = servers.find((s) => s.id === currentServerIdForNote);
      if (server && server.url) {
        targetUrl = `${server.url.replace(/\/+$/, "")}/api/notes`;
        isPeer = true;
      }
    }

    fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: isPeer ? "local" : currentServerIdForNote,
        host_ip: modalPort.host_ip,
        host_port: modalPort.host_port,
        note: draftNote,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to save note on backend.");
      })
      .catch((error) => {
        logger.error("Error saving note:", error);
        setGroups((currentGroups) =>
          currentGroups.map((group) => {
            if (group.id === modalSrvId) {
              const revertedData = group.data.map((port) => {
                if (
                  port.host_ip === modalPort.host_ip &&
                  port.host_port === modalPort.host_port
                ) {
                  return { ...port, note: originalNote };
                }
                return port;
              });
              return { ...group, data: revertedData };
            }
            return group;
          })
        );
      });
  }, [modalSrvId, modalPort, draftNote, servers]);

  const fetchServers = useCallback(() => {
    fetch("/api/servers")
      .then((r) => r.json())
      .then(setServers)
      .catch(logger.error);
  }, []);

  const addServer = useCallback(
    async (serverData, isUpdate = false) => {
      if (isUpdate) {
        const originalGroups = groups;
        const updatedGroups = groups.map((g) => {
          if (g.id === serverData.id) {
            return {
              ...g,
              server: serverData.label,
              label: serverData.label,
              url: serverData.url,
              parentId: serverData.parentId || null,
              platform_type: serverData.platform_type,
            };
          }
          return g;
        });
        setGroups(updatedGroups);

        try {
          const response = await fetch("/api/servers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: serverData.id,
              label: serverData.label,
              url: serverData.url,
              parentId: serverData.parentId || null,
              type: serverData.type || "peer",
              unreachable: serverData.unreachable || false,
              platform_type: serverData.platform_type || "unknown",
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Validation failed");
          }
        } catch (error) {
          setGroups(originalGroups);
          logger.error("Failed to save server:", error);
          throw error;
        }
      } else {
        const placeholderServer = {
          id: serverData.id,
          server: serverData.label,
          label: serverData.label,
          url: serverData.url,
          parentId: serverData.parentId || null,
          platform_type: serverData.platform_type,
          ok: null,
          data: [],
          systemInfo: {},
          vms: [],
        };

        setGroups((currentGroups) => [...currentGroups, placeholderServer]);

        try {
          const response = await fetch("/api/servers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: serverData.id,
              label: serverData.label,
              url: serverData.url,
              parentId: serverData.parentId || null,
              type: serverData.type || "peer",
              unreachable: serverData.unreachable || false,
              platform_type: serverData.platform_type || "unknown",
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Validation failed");
          }

          const scanResponse = await fetch(
            `/api/servers/${serverData.id}/scan`
          );
          if (scanResponse.ok) {
            const scanData = await scanResponse.json();
            const transformedPorts = await transformCollectorData(
              scanData,
              serverData.id
            );

            const finalServerData = {
              id: serverData.id,
              server: serverData.label,
              label: serverData.label,
              ok: true,
              url: serverData.url,
              platform: scanData.platform,
              platformName: scanData.platformName,
              data: transformedPorts,
              systemInfo: scanData.systemInfo,
              applications: scanData.applications,
              vms: scanData.vms,
              parentId: serverData.parentId,
              platform_type: serverData.platform_type || scanData.platform,
              enhancedFeaturesEnabled: true,
            };

            setGroups((currentGroups) =>
              currentGroups.map((g) =>
                g.id === serverData.id ? finalServerData : g
              )
            );
          } else {
            const errorData = await scanResponse
              .json()
              .catch(() => ({ error: `Scan failed` }));
            setGroups((currentGroups) =>
              currentGroups.map((g) => {
                if (g.id === serverData.id) {
                  return {
                    ...g,
                    ok: false,
                    error: errorData.details || errorData.error,
                  };
                }
                return g;
              })
            );
          }
        } catch (error) {
          logger.error("Failed to add server:", error);
          setGroups((currentGroups) =>
            currentGroups.filter((g) => g.id !== serverData.id)
          );
          throw error;
        }
      }
    },
    [groups, transformCollectorData]
  );

  const deleteServer = useCallback(
    async (id) => {
      const originalServers = servers;
      const originalGroups = groups;

      setServers((currentServers) => currentServers.filter((s) => s.id !== id));
      setGroups((currentGroups) => currentGroups.filter((g) => g.id !== id));

      if (selectedServer === id) {
        setSelectedServer(null);
      }

      try {
        const response = await fetch(`/api/servers/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`Failed to delete server: ${response.status}`);
        }

        await fetchServers();
      } catch (error) {
        setServers(originalServers);
        setGroups(originalGroups);
        logger.error("Failed to delete server:", error);
      }
    },
    [servers, groups, selectedServer, fetchServers]
  );

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const filterPorts = (group) => {
    if (!group.ok || !group.data) return group;

    const filteredData = group.data.filter((port) => {
      const matchesSourceFilter =
        (port.source === "docker" && filters.docker) ||
        (port.source === "system" && filters.system);

      if (!matchesSourceFilter) return false;

      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      return (
        port.host_port.toString().includes(searchLower) ||
        (port.owner && port.owner.toLowerCase().includes(searchLower)) ||
        (port.host_ip && port.host_ip.includes(searchLower)) ||
        port.target?.includes?.(searchLower) ||
        (port.note && port.note.toLowerCase().includes(searchLower))
      );
    });

    return {
      ...group,
      data: filteredData,
    };
  };

  function renderServer(server) {
    const filteredServer = filterPorts(server);

    return (
      <ServerSection
        key={server.id}
        id={server.id}
        server={server.server}
        ok={server.ok}
        data={filteredServer.data || []}
        error={server.error}
        errorType={server.errorType}
        searchTerm={searchHighlighting ? searchTerm : ""}
        actionFeedback={actionFeedback}
        onNote={openNoteModal}
        onToggleIgnore={toggleIgnore}
        onCopy={(p, portProtocol) => {
          let hostForCopy;
          if (server.id === "local" &&
              (p.host_ip === "0.0.0.0" ||
               p.host_ip === "127.0.0.1" ||
               p.host_ip === "[::]" ||
               p.host_ip === "[::1]")) {
            hostForCopy = window.location.hostname;
          }
          else if (
            server.id !== "local" &&
            server.url &&
            (p.host_ip === "0.0.0.0" ||
             p.host_ip === "127.0.0.1" ||
             p.host_ip === "[::]" ||
             p.host_ip === "[::1]")
          ) {
            try {
              hostForCopy = new URL(server.url).hostname;
            } catch {
              hostForCopy = "localhost";
            }
          }
          else {
            hostForCopy = p.host_ip;
          }

          const actualProtocol = portProtocol || "http";
          const urlToCopy = `${actualProtocol}://${hostForCopy}:${p.host_port}`;

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
              .writeText(urlToCopy)
              .then(() => {
                setActionFeedback(prev => ({ 
                  ...prev, 
                  copy: { id: keyOf(server.id, p) } 
                }));
                setTimeout(
                  () => setActionFeedback(prev => ({ 
                    ...prev, 
                    copy: null 
                  })),
                  1500
                );
              })
              .catch((err) => {
                logger.warn("Clipboard write failed, using fallback:", err);
                copyToClipboardFallback(urlToCopy, server.id, p);
              });
          } else {
            copyToClipboardFallback(urlToCopy, server.id, p);
          }
        }}
        serverUrl={server.url}
        platformName={server.platformName}
        systemInfo={server.systemInfo}
        vms={server.vms}
        infoCardLayout={infoCardLayout}
        onInfoCardLayoutChange={setInfoCardLayout}
        portLayout={portLayout}
        onPortLayoutChange={setPortLayout}
        isExpanded={!!expandedServers[server.id]}
        onToggleExpanded={() => toggleServerExpanded(server.id)}
        openAccordionItems={openAccordions[server.id] ?? ["system-info", "vms"]}
        onAccordionChange={(items) => handleAccordionChange(server.id, items)}
      />
    );
  }

  const serverToRender = selectedServer
    ? groups.find((g) => g.id === selectedServer)
    : null;
  const noDataForSelection = selectedServer && !serverToRender && !loading;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
        <AppHeader
          groups={groups}
          loading={loading}
          onRefresh={fetchAll}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchHighlighting={searchHighlighting}
          onSearchHighlightingChange={setSearchHighlighting}
          filters={filters}
          onFilterChange={setFilters}
          selectedServer={selectedServer}
          isDarkMode={isDarkMode}
          onThemeToggle={() => setIsDarkMode(!isDarkMode)}
          onGoHome={handleLogoClick}
          onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
        />
        <DashboardLayout
          isSidebarOpen={isSidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
          sidebar={
            <Sidebar
              servers={groups}
              selectedId={selectedServer}
              onSelect={handleSelectServer}
              onAdd={addServer}
              onDelete={deleteServer}
              loading={loading}
            />
          }
        >
          <main className="flex-1 overflow-auto">
            <div className="p-6">
              {loading && (
                <MultipleServerSkeleton count={selectedServer ? 1 : 2} />
              )}

              {error && !loading && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {!loading && !selectedServer && (
                <div className="text-center py-24 text-slate-500 dark:text-slate-400 flex flex-col items-center">
                  <BarChart3 className="h-16 w-16 mb-4 text-slate-400" />
                  <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">
                    Dashboard Home
                  </h2>
                  <p className="mt-2 max-w-md">
                    Select a server from the sidebar to view its ports, system
                    information, and more. Use the "Add Server" button to
                    connect to new local or remote environments.
                  </p>
                </div>
              )}

              {!loading && noDataForSelection && (
                <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                  No data available for the selected server. It might be offline
                  or misconfigured.
                </div>
              )}

              {!loading && serverToRender && (
                <div className="space-y-8">{renderServer(serverToRender)}</div>
              )}
            </div>
          </main>
        </DashboardLayout>
      </div>

      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Port Note</DialogTitle>
            <DialogDescription>
              Add or edit a note for this port to help remember its purpose or
              configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNote}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );

  function copyToClipboardFallback(text, serverId, port) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      if (successful) {
        setActionFeedback(prev => ({ 
          ...prev, 
          copy: { id: keyOf(serverId, port) } 
        }));
        setTimeout(() => setActionFeedback(prev => ({ 
          ...prev, 
          copy: null 
        })), 1500);
      } else {
        prompt("Copy this URL:", text);
      }
    } catch (err) {
      logger.warn("Copy failed:", err);
      prompt("Copy this URL:", text);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
