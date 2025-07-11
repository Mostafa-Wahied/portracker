/**
 * PORTS TRACKER - TRUENAS SCALE COLLECTOR
 *
 * Implements a hybrid data collection strategy for TrueNAS SCALE systems.
 * Collects core system information, Docker containers, and network ports
 * using local command-line tools (e.g., `docker`, `ss`). This phase
 * operates without needing a TrueNAS API key.
 * If a TRUENAS_API_KEY is provided, it attempts to collect enhanced
 * information such as TrueNAS native applications, virtual machines,
 * and detailed system information by connecting to the TrueNAS
 * middleware via a WebSocket client (`TrueNASClient`).
 * The collector gracefully degrades if the API key is not available, providing
 * only the core data from the initial collection phase.
 */

const BaseCollector = require("./base_collector");
const { exec } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);
const fs = require("fs");
const { TrueNASClient } = require("../lib/truenas-rpc");
const PerformanceTracker = require("../utils/performance-tracker");

class TrueNASCollector extends BaseCollector {
  /**
   * Create a new TrueNAS collector
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super(config);
    this.platform = "truenas";
    this.platformName = "TrueNAS";
    this.name = "TrueNAS Collector";
    this.client = new TrueNASClient({ debug: this.debug });

    // Initialize cache system
    this.cache = {
      systemInfo: { data: null, timestamp: 0 },
      dockerContainers: { data: null, timestamp: 0 },
      systemPorts: { data: null, timestamp: 0 },
      hostNetworkContainers: { data: null, timestamp: 0 },
    };

    // Cache timeout configuration (default 60 seconds)
    this.cacheTimeout = parseInt(process.env.CACHE_TIMEOUT_MS || "60000", 10);
    this.cacheDisabled = process.env.DISABLE_CACHE === "true";
    if (this.cacheDisabled) {
      this.logWarn(
        "Caching is globally disabled via DISABLE_CACHE environment variable."
      );
    }

    // Important ports by service (with protocols)
    this.importantPorts = {
      51820: { service: "WireGuard", protocol: "udp" },
      51821: { service: "WireGuard-UI", protocol: "tcp" },
      51822: { service: "WireGuard", protocol: "udp" },
      500: { service: "IPsec IKE", protocol: "udp" },
      4500: { service: "IPsec NAT-T", protocol: "udp" },
      1194: { service: "OpenVPN", protocol: "udp" },
      1198: { service: "OpenVPN", protocol: "udp" },
      53: { service: "DNS", protocol: "udp" },
      67: { service: "DHCP", protocol: "udp" },
      68: { service: "DHCP", protocol: "udp" },
    };

    this.importantUdpPorts = {
      51820: "WireGuard",
      51822: "WireGuard",
      500: "IPsec IKE",
      4500: "IPsec NAT-T",
      1194: "OpenVPN",
      1198: "OpenVPN",
      53: "DNS",
      67: "DHCP",
      68: "DHCP",
    };
  }

  /**
   * Check if this system is TrueNAS with confidence score
   * @param {Object} serverConfig The server's configuration, including API keys.
   * @returns {Promise<number>} Confidence score 0-100
   */
  async isCompatible(serverConfig) {
    let score = 0;
    let reasons = [];
    this.logInfo("Checking TrueNAS compatibility...");
    try {
      const { stdout: kernelInfo } = await execAsync("uname -a");
      if (kernelInfo.toLowerCase().includes("truenas")) {
        score += 60;
        reasons.push("TrueNAS kernel signature found");
        this.log("✓ Found TrueNAS kernel signature (+60)");
      }
    } catch (err) {
      this.logWarn(
        "Error checking kernel for TrueNAS compatibility:",
        err.message
      );
    }
    try {
      const { stdout: osRelease } = await execAsync(
        'cat /etc/os-release 2>/dev/null || echo ""'
      );
      if (osRelease.toLowerCase().includes("truenas")) {
        score += 40;
        reasons.push("TrueNAS OS release identifier found");
        this.log("✓ Found TrueNAS in OS release (+40)");
      }
    } catch (err) {
      this.logWarn(
        "Error checking OS release for TrueNAS compatibility:",
        err.message
      );
    }
    const socketPaths = [
      "/var/run/middlewared.sock",
      "/run/middlewared.sock",
      "/run/middleware/middlewared.sock",
    ];
    for (const socketPath of socketPaths) {
      try {
        const exists = fs.existsSync(socketPath);
        if (exists) {
          score += 10;
          reasons.push(`Found middleware socket at ${socketPath}`);
          this.log(`✓ Found middleware socket at ${socketPath} (+10)`);
          break; 
        }
      } catch (err) {
        this.logWarn(`Error checking socket at ${socketPath}:`, err.message);
      }
    }
    const truenasDirs = [
      "/usr/local/etc/ix",
      "/etc/netcli",
      "/data/truenas-config",
    ];
    for (const dir of truenasDirs) {
      try {
        const exists = fs.existsSync(dir);
        if (exists) {
          score += 10;
          reasons.push(`TrueNAS directory found: ${dir}`);
          this.log(`✓ Found TrueNAS directory: ${dir} (+10)`);
          break;
        }
      } catch (err) {
        this.logWarn(`Error checking directory ${dir}:`, err.message);
      }
    }

    if (
      (serverConfig && serverConfig.truenas_api_key) ||
      process.env.TRUENAS_API_KEY
    ) {
      score += 20;
      reasons.push("TrueNAS API key provided");
      this.log("✓ Found TrueNAS API key (+20)");
    }

    this.detectionReasons = reasons;
    if (score > 0) {
      this.logInfo(
        `TrueNAS detector final score: ${score}/100. Reasons: ${reasons.join(
          "; "
        )}`
      );
    } else {
      this.log(
        `TrueNAS detector final score: ${score}/100. Reasons: ${reasons.join(
          "; "
        )}`
      );
    }
    return score;
  }

  /**
   * Store detection information for API access
   * @param {Object} info Detection information
   */
  setDetectionInfo(info) {
    this.log("Setting detection info for TrueNASCollector:", info);
    this.detectionInfo = info;
  }

  /**
   * Get Docker containers using docker command
   * @returns {Promise<Array>} List of Docker containers
   */
  async _getDockerContainers() {
    try {
      this.log(
        'Getting Docker containers via "docker inspect" for robust data'
      );
      const { stdout: containerIds } = await execAsync("docker ps -aq");
      if (!containerIds.trim()) {
        return [];
      }

      const ids = containerIds.trim().split("\n").join(" ");
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect ${ids}`
      );

      const containers = JSON.parse(inspectOutput).map((container) => ({
        id: container.Id,
        name: container.Name.startsWith("/")
          ? container.Name.substring(1)
          : container.Name,
        status: this._mapDockerStatus(container.State.Status),
        image: container.Config.Image,
        command: container.Path + " " + container.Args.join(" "),
        created: container.Created,
        ports: container.HostConfig.PortBindings,
        networks: Object.keys(container.NetworkSettings.Networks).join(", "),
      }));

      return containers;
    } catch (err) {
      this.logError(
        'Error getting Docker containers via "docker inspect":',
        err.message,
        err.stack
      );
      return this._getDockerContainersWithPs();
    }
  }

  /**
   * Fallback method to get Docker containers using 'docker ps'.
   * @returns {Promise<Array>} List of Docker containers
   */
  async _getDockerContainersWithPs() {
    try {
      this.logWarn('Falling back to "docker ps" for container collection.');
      const { stdout } = await execAsync('docker ps -a --format "{{json .}}"');
      const containers = stdout
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (err) {
            this.logWarn("Error parsing container JSON line:", err.message, {
              line,
            });
            return null;
          }
        })
        .filter(Boolean)
        .map((container) => ({
          id: container.ID,
          name: container.Names,
          status: this._mapDockerStatus(container.Status),
          image: container.Image,
          command: container.Command,
          created: container.CreatedAt,
          ports: container.Ports,
          networks: container.Networks,
        }));
      return containers;
    } catch (err) {
      this.logError(
        'Error getting Docker containers via fallback "docker ps":',
        err.message,
        err.stack
      );
      return [];
    }
  }

  /**
   * Parse Docker ports string into structured format
   * @param {string} portsString Ports string from Docker
   * @returns {Array} Structured ports information
   */
  _parseDockerPorts(portsString) {
    if (!portsString || typeof portsString !== "string") {
      return [];
    }
    try {
      const ports = [];
      const portMappings = portsString.split(", ");
      for (const mapping of portMappings) {
        if (mapping.includes("->")) {
          const [external, internal] = mapping.split("->");
          let hostIP = "0.0.0.0";
          let hostPort;
          if (external.includes(":")) {
            [hostIP, hostPort] = external.split(":");
          } else {
            hostPort = external;
          }
          const [containerPort, proto] = internal.split("/");
          ports.push({
            host_ip: hostIP === "0.0.0.0" || hostIP === "::" ? "*" : hostIP,
            host_port: parseInt(hostPort, 10),
            container_port: parseInt(containerPort, 10),
            protocol: proto || "tcp",
          });
        } else {
          const [port, proto] = mapping.split("/");
          ports.push({
            container_port: parseInt(port, 10),
            protocol: proto || "tcp",
          });
        }
      }
      return ports;
    } catch (err) {
      this.logWarn("Error parsing Docker ports string:", err.message, {
        portsString,
      });
      return [];
    }
  }

  /**
   * Extract ports from TrueNAS app configuration
   * @param {Object} app TrueNAS app object
   * @returns {Array} Array of port objects
   */
  _extractAppPorts(app) {
    const ports = [];
    try {
      if (app.port_mappings && Array.isArray(app.port_mappings)) {
        for (const mapping of app.port_mappings) {
          ports.push({
            host_ip: mapping.host_ip || "*",
            host_port: mapping.host_port,
            container_port: mapping.container_port,
            protocol: mapping.protocol || "tcp",
          });
        }
      }
      if (
        app.config &&
        app.config.port_mappings &&
        Array.isArray(app.config.port_mappings)
      ) {
        for (const mapping of app.config.port_mappings) {
          ports.push({
            host_ip: mapping.host_ip || "*",
            host_port: mapping.host_port,
            container_port: mapping.container_port,
            protocol: mapping.protocol || "tcp",
          });
        }
      }
    } catch (err) {
      this.logWarn(
        "Error extracting app ports from TrueNAS app object:",
        err.message,
        { appName: app.name }
      );
    }
    return ports;
  }

  /**
   * Map TrueNAS app status to standardized status
   * @param {string} status TrueNAS app status
   * @returns {string} Standardized status
   */
  _mapStatus(status) {
    switch (status?.toLowerCase()) {
      case "running":
        return "running";
      case "stopped":
        return "stopped";
      case "error":
        return "error";
      default:
        return status || "unknown";
    }
  }

  /**
   * Map Docker status to standardized status
   * @param {string} status Docker status
   * @returns {string} Standardized status
   */
  _mapDockerStatus(status) {
    const lowerStatus = status?.toLowerCase() || "";
    if (lowerStatus.includes("up") || lowerStatus.includes("running")) {
      return "running";
    } else if (
      lowerStatus.includes("exited") ||
      lowerStatus.includes("stopped")
    ) {
      return "stopped";
    } else if (lowerStatus.includes("restarting")) {
      return "restarting";
    } else if (lowerStatus.includes("created")) {
      return "created";
    } else if (lowerStatus.includes("paused")) {
      return "paused";
    } else {
      return "unknown";
    }
  }

  /**
   * Get ports from Docker containers
   * @returns {Promise<Array>} List of Docker container ports
   */
  async _getDockerPorts() {
    try {
      this.log('Getting Docker port mappings via "docker ps" (for port list)');
      this._debugNetworkInterfaces();
      const { stdout } = await execAsync(
        'docker ps -a --no-trunc --format "{{.Names}}|{{.Ports}}|{{.ID}}"'
      );
      const lines = stdout.trim().split("\n");
      const ports = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const [name, portsStr, containerId] = line.split("|");
        if (!portsStr || portsStr === "") continue;
        const portMappings = portsStr.split(", ");
        for (const mapping of portMappings) {
          if (!mapping.includes("->")) continue;
          const [external, internal] = mapping.split("->");
          let hostIP = "*";
          let hostPort;
          if (external.includes(":")) {
            const parts = external.split(":");
            hostIP = this._resolveHostIP(parts[0]);
            hostPort = parts[1];
          } else {
            hostPort = external;
            hostIP = this._getServerIP();
          }
          const [containerPort, proto] = internal.split("/");

          if (hostIP.endsWith(".255")) {
            this.log(
              `Skipping broadcast address port for ${name}: ${hostIP}:${hostPort}`
            );
            continue;
          }

          ports.push({
            source: "docker",
            owner: name,
            protocol: proto || "tcp",
            host_ip: hostIP,
            host_port: parseInt(hostPort, 10),
            target: containerPort,
            container_id: containerId,
            vm_id: null,
            app_id: containerId,
          });
        }
      }
      return ports;
    } catch (err) {
      this.logError(
        "Error getting Docker port mappings for port list:",
        err.message,
        err.stack
      );
      return [];
    }
  }

  /**
   * Resolve wildcard and generic IPs to actual server IP with network context awareness
   * @param {string} host_ip The host IP from Docker
   * @returns {string} Resolved IP address
   */
  _resolveHostIP(host_ip) {
    if (host_ip === "0.0.0.0" || host_ip === "::") {
      return host_ip;
    }

    switch (host_ip) {
      case "*":
        return "0.0.0.0"; 
      case "127.0.0.1":
      case "localhost":
        return "127.0.0.1";
      default:
        return host_ip;
    }
  }

  /**
   * @returns {string} Server IP address, now always '0.0.0.0' for wildcard.
   */
  _getServerIP() {
    // Try to get the server IP from the server's own configuration
    try {
      const os = require("os");
      const networkInterfaces = os.networkInterfaces();
      
      // Look for primary network interfaces (not Docker bridges or virtual interfaces)
      const primaryInterfaces = ['eth0', 'enp0s3', 'enp0s8', 'ens33', 'ens160', 'em0'];
      
      for (const interfaceName of primaryInterfaces) {
        if (networkInterfaces[interfaceName]) {
          const addresses = networkInterfaces[interfaceName];
          for (const addr of addresses) {
            if (!addr.internal && addr.family === 'IPv4') {
              this.log(`Found primary interface ${interfaceName}: ${addr.address}`);
              return addr.address;
            }
          }
        }
      }
      
      // Fallback: look for any non-internal, non-Docker interface
      for (const [interfaceName, addresses] of Object.entries(networkInterfaces)) {
        // Skip Docker, bridge, and virtual interfaces
        if (interfaceName.startsWith('docker') || 
            interfaceName.startsWith('br-') ||
            interfaceName.startsWith('veth') ||
            interfaceName === 'lo') {
          continue;
        }
        
        for (const addr of addresses) {
          if (!addr.internal && addr.family === 'IPv4') {
            // Prefer private network IPs
            if (addr.address.startsWith('192.168.') ||
                addr.address.startsWith('10.') ||
                (addr.address.startsWith('172.') && 
                 parseInt(addr.address.split('.')[1]) >= 16 && 
                 parseInt(addr.address.split('.')[1]) <= 31)) {
              this.log(`Found suitable interface ${interfaceName}: ${addr.address}`);
              return addr.address;
            }
          }
        }
      }
      
      this.logWarn("Could not determine server IP, falling back to 0.0.0.0");
      return "0.0.0.0";
    } catch (error) {
      this.logError("Error determining server IP:", error.message);
      return "0.0.0.0";
    }
  }

  /**
   * Get system ports using ss command
   * @returns {Promise<Array>} List of system ports
   */
  async _getSystemPorts() {
    try {
      this.log('Getting system ports via "ss -tulpn"');
      const { stdout } = await execAsync("ss -tulpn");
      const lines = stdout.trim().split("\n");
      const ports = [];
      const includeUdp = process.env.INCLUDE_UDP === "true";

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = line.split(/\s+/);
        if (columns.length < 5) continue;
        const protocol = columns[0].toLowerCase();

        if (!includeUdp && !protocol.startsWith("tcp")) {
          continue; // Default behavior: skip non-TCP ports
        }

        const localAddress = columns[4];
        const match = localAddress.match(/(.+):(\d+)$/);
        if (!match) continue;

        let [, address, port] = match;
        if (address.includes("%")) {
          address = address.split("%")[0];
        }

        const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+),/);
        const process = processMatch ? processMatch[1] : null;
        const pid = processMatch ? parseInt(processMatch[2], 10) : null;

        let resolvedHostIP;
        if (address === "0.0.0.0" || address === "::") {
          resolvedHostIP = "0.0.0.0";
        } else {
          resolvedHostIP = address;
        }

        ports.push({
          source: "system",
          owner: process || "system",
          protocol: protocol === "tcp" ? "tcp" : "udp",
          host_ip: resolvedHostIP,
          host_port: parseInt(port, 10),
          target: null,
          container_id: null,
          vm_id: null,
          app_id: null,
          pid: pid,
        });
      }
      return ports;
    } catch (err) {
      this.logError(
        'Error getting system ports via "ss":',
        err.message,
        err.stack
      );
      return [];
    }
  }

  /**
   * Map VM status to standardized status
   * @param {string} status VM status
   * @returns {string} Standardized status
   */
  _mapVMStatus(status) {
    switch (status?.toUpperCase()) {
      case "RUNNING":
        return "running";
      case "STOPPED":
        return "stopped";
      case "PAUSED":
        return "paused";
      default:
        return status?.toLowerCase() || "unknown";
    }
  }

  /**
   * Main collection method - with clean API key separation
   * @returns {Promise<Object>} Collection results
   */
  async collect() {
    const perf = new PerformanceTracker();
    perf.start("total-collection");

    const results = {
      platform: this.platform,
      platformName: this.platformName,
      systemInfo: null,
      applications: [],
      ports: [],
      vms: [],
      error: null,
      enhancedFeaturesEnabled: !!process.env.TRUENAS_API_KEY,
    };

    let containerCreationTimeMap = new Map();

    try {
      this.logInfo("Starting core functionality collection (Docker + System)");

      // System Info Collection
      perf.start("system-info-collection");
      try {
        results.systemInfo = await this._getCachedOrFresh(
          "systemInfo",
          () => this._getBasicSystemInfoViaDocket(),
          30000 // 30 second cache for system info
        );
        this.logInfo("Basic system info collected via Docker commands");
      } catch (err) {
        this.logWarn(
          "Basic system info collection encountered issues, using fallback data if available."
        );
        results.systemInfo = this._getFallbackSystemInfo();
      }
      perf.end("system-info-collection");

      // Docker Container Collection
      perf.start("docker-containers-collection");
      try {
        const dockerContainers = await this._getCachedOrFresh(
          "dockerContainers",
          () => this._getDockerContainers(),
          45000 // 45 second cache for containers
        );

        containerCreationTimeMap = new Map(
          dockerContainers.map((c) => [c.id, c.created])
        );

        results.applications.push(
          ...dockerContainers.map((container) => ({
            type: "application",
            id: container.id,
            name: container.name,
            status: container.status,
            version: "N/A",
            image: container.image,
            command: container.command,
            created: container.created,
            platform: "docker",
            platform_data: {
              type: "container",
              size: "N/A",
              mounts: "N/A",
              networks: container.networks || "N/A",
              ports: this._parseDockerPorts(container.ports),
            },
          }))
        );
        this.logInfo(`Collected ${dockerContainers.length} Docker containers`);
      } catch (err) {
        this.logWarn("Docker container collection failed:", err.message);
      }
      perf.end("docker-containers-collection");

      // Port Collection and Reconciliation
      perf.start("port-collection-and-reconciliation");
      try {
        perf.start("docker-ports-collection");
        const dockerPorts = await this._getDockerPorts();
        perf.end("docker-ports-collection");

        perf.start("system-ports-collection");
        const systemPorts = await this._getCachedOrFresh(
          "systemPorts",
          () => this._getSystemPorts(),
          30000 // 30 second cache for system ports
        );
        perf.end("system-ports-collection");

        perf.start("pid-to-container-mapping");
        const pidToContainerMap = new Map();
        try {
          const { stdout: inspectLines } = await execAsync(
            `docker ps -q | xargs docker inspect --format '{{.State.Pid}}::{{.Id}}::{{.Name}}'`
          );
          inspectLines
            .trim()
            .split("\n")
            .forEach((line) => {
              if (!line) return;
              const [pid, id, rawName] = line.split("::");
              if (pid && id && rawName && pid !== "0") {
                pidToContainerMap.set(parseInt(pid, 10), {
                  id: id,
                  name: rawName.startsWith("/")
                    ? rawName.substring(1)
                    : rawName,
                });
              }
            });
          this.log(
            `Successfully built PID-to-Container map with ${pidToContainerMap.size} entries.`
          );
        } catch (e) {
          this.logWarn(
            "Could not build PID-to-Container map. Host-networked apps may be misidentified.",
            { error: e.message }
          );
        }
        perf.end("pid-to-container-mapping");

        perf.start("process-start-times-collection");
        // Gather process start times for system ports
        const pids = [
          ...new Set(systemPorts.map((p) => p.pid).filter(Boolean)),
        ];
        const processStartTimeMap = new Map();
        if (pids.length > 0) {
          try {
            const { stdout } = await execAsync(
              `ps -o pid,lstart --no-headers -p ${pids.join(",")}`
            );
            stdout
              .trim()
              .split("\n")
              .forEach((line) => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[0];
                const startTime = new Date(
                  parts.slice(1).join(" ")
                ).toISOString();
                processStartTimeMap.set(parseInt(pid, 10), startTime);
              });
          } catch (psErr) {
            this.logWarn("Could not fetch process start times:", psErr.message);
          }
        }
        perf.end("process-start-times-collection");

        perf.start("port-reconciliation");
        const uniquePorts = new Map();

        const hostProcToContainerMap =
          await this._buildHostProcToContainerMap();

        for (const port of dockerPorts) {
          const key = `${port.host_ip}:${port.host_port}`;
          port.created =
            containerCreationTimeMap.get(port.container_id) || null;
          uniquePorts.set(key, port);
        }

        for (const port of systemPorts) {
          const key = `${port.host_ip}:${port.host_port}`;
          if (uniquePorts.has(key)) {
            const existingPort = uniquePorts.get(key);
            if (!existingPort.pid) existingPort.pid = port.pid;
            continue;
          }

          let containerIdForPort = null;
          let ownerName = port.owner;

          // Logic for PID-based mapping (from bridged networks)
          if (port.pid && pidToContainerMap.has(port.pid)) {
            const containerInfo = pidToContainerMap.get(port.pid);
            containerIdForPort = containerInfo.id;
            ownerName = containerInfo.name;
            port.source = "docker";
            this.log(
              `Re-classified port ${port.host_port} to owner ${ownerName} via PID map.`
            );
          } else if (port.pid && hostProcToContainerMap.has(port.pid)) {
            const containerInfo = hostProcToContainerMap.get(port.pid);
            containerIdForPort = containerInfo.id;
            ownerName = containerInfo.name;
            port.source = "docker";
            port.target = port.host_port;
            this.log(
              `Re-classified port ${port.host_port} to owner ${ownerName} via HOST-PROC map.`
            );
          }

          port.owner = ownerName;
          if (containerIdForPort) {
            port.container_id = containerIdForPort;
            port.app_id = containerIdForPort;
            port.created =
              containerCreationTimeMap.get(containerIdForPort) || null;
          }

          if (port.pid) {
            port.created = processStartTimeMap.get(port.pid) || null;
          }

          uniquePorts.set(key, port);
        }

        perf.start("self-container-attribution");
        const ourPort = parseInt(process.env.PORT || "4999", 10);
        for (const [key, port] of uniquePorts.entries()) {
          if (
            port.host_port === ourPort &&
            (port.owner === "node" || port.owner === "system") &&
            port.source === "system"
          ) {
            try {
              const { stdout } = await execAsync(
                'docker ps --filter "name=portracker" --format "{{.ID}}|{{.Names}}"'
              );
              const lines = stdout.trim().split("\n");

              if (lines.length > 0 && lines[0]) {
                const [containerId, containerName] = lines[0].split("|");

                if (containerId) {
                  this.log(
                    `Re-classifying our own application port ${ourPort} from system/node to ${containerName}`
                  );
                  port.source = "docker";
                  port.owner = containerName;
                  port.container_id = containerId;
                  port.app_id = containerId;
                  port.target = port.host_port;

                  port.created =
                    containerCreationTimeMap.get(containerId) || port.created;
                }
              }
            } catch (e) {
              this.logWarn(
                `Could not re-classify our own application port ${ourPort}:`,
                e.message
              );
            }
          }
        }
        perf.end("self-container-attribution");

        perf.start("port-filtering");
        const includeSystemUdp = process.env.INCLUDE_UDP === "true";
        results.ports = Array.from(uniquePorts.values())
          .filter((port) => {
            if (port.protocol === "tcp") {
              if (
                this.importantPorts &&
                this.importantPorts[port.host_port] &&
                this.importantPorts[port.host_port].protocol === "tcp" &&
                port.source === "system" &&
                !port.container_id
              ) {
                this._enhanceKnownPort(port, results.applications);
              }
              return true;
            }

            if (port.source === "docker") {
              return true;
            }

            // Always include important UDP ports like WireGuard, OpenVPN, etc.
            if (
              port.protocol === "udp" &&
              this.importantUdpPorts[port.host_port]
            ) {
              if (port.source === "system" && !port.container_id) {
                this._enhanceKnownPort(port, results.applications);
              }
              return true;
            }

            if (port.protocol === "udp" && port.source === "system") {
              return includeSystemUdp;
            }

            return false;
          })
          .map((port) => this.normalizePortEntry(port));
        perf.end("port-filtering");
        perf.end("port-reconciliation");

        this.logInfo(
          `Collected ${dockerPorts.length} Docker ports and ${systemPorts.length} system ports = ${results.ports.length} unique ports after reconciliation.`
        );
      } catch (err) {
        this.logWarn("Port collection failed:", err.message);
      }
      perf.end("port-collection-and-reconciliation");

      // Enhanced Features Collection
      perf.start("enhanced-features-collection");
      const apiKey = process.env.TRUENAS_API_KEY;
      if (apiKey) {
        this.logInfo("API key detected - collecting enhanced TrueNAS features");
        try {
          const enhancedData = await this._collectEnhancedFeatures();
          if (enhancedData.systemInfo) {
            results.systemInfo = {
              ...results.systemInfo,
              ...enhancedData.systemInfo,
              enhanced: true,
            };
          }
          if (enhancedData.apps && enhancedData.apps.length > 0) {
            const truenasApps = enhancedData.apps.map((app) => ({
              type: "application",
              id: app.id,
              name: app.name,
              status: app.status,
              version: app.version || "N/A",
              image: app.image || "N/A",
              command: "N/A",
              created: app.started || "N/A",
              platform: "truenas",
              platform_data: {
                type: "truenas_app",
                app_type: app.catalog || "unknown",
                catalog: app.catalog,
                ports: this._extractAppPorts(app),
                orig_data: app,
              },
            }));
            results.applications.push(...truenasApps);
            this.logInfo(`Collected ${truenasApps.length} TrueNAS native apps`);
          }
          if (enhancedData.vms && enhancedData.vms.length > 0) {
            results.vms = enhancedData.vms.map((vm) => ({
              type: "vm",
              id: vm.id,
              name: vm.name,
              status: this._mapVMStatus(vm.status),
              vcpus: vm.cpu,
              memory: vm.memory,
              autostart: vm.autostart,
              platform: "truenas",
              platform_data: {
                aliases: vm.aliases,
                image: vm.image,
                os: vm.image?.os || "unknown",
                vnc_enabled: vm.vnc_enabled,
                storage_pool: vm.storage_pool,
                orig_data: vm,
              },
            }));
            this.logInfo(`Collected ${results.vms.length} virtual machines`);
          }
          this.logInfo("Enhanced features collection completed successfully");
        } catch (err) {
          this.logWarn(
            `Enhanced features collection failed: ${err.message.substring(
              0,
              100
            )}...`
          );
          this.logInfo("Continuing with core functionality only");
        }
      } else {
        this.logInfo(
          "No TRUENAS_API_KEY provided - enhanced features disabled"
        );
        this.logInfo(
          "To enable VMs and TrueNAS native apps, set TRUENAS_API_KEY environment variable"
        );
      }
      perf.end("enhanced-features-collection");

      perf.end("total-collection");

      // Log performance summary
      const summary = perf.getSummary();
      this.logInfo("=== Performance Summary ===");
      summary.forEach(({ operation, duration }) => {
        this.logInfo(`  ${operation}: ${duration}ms`);
      });
      this.logInfo("=== End Performance Summary ===");

      // Log cache status for monitoring
      const cacheStatus = Object.keys(this.cache)
        .map((key) => {
          const cached = this.cache[key];
          if (cached.data) {
            const age = ((Date.now() - cached.timestamp) / 1000).toFixed(1);
            return `${key}: ${age}s old`;
          }
          return `${key}: empty`;
        })
        .join(", ");

      this.logInfo(`Cache status: ${cacheStatus}`);
      this.logInfo(
        `Collection complete: ${results.applications.length} apps, ${results.ports.length} ports, ${results.vms.length} VMs`
      );
      this.logInfo(
        `Enhanced features: ${
          results.enhancedFeaturesEnabled ? "ENABLED" : "DISABLED"
        }`
      );
      return results;
    } catch (err) {
      perf.end("total-collection");
      this.logError(
        "Critical collection error in TrueNASCollector:",
        err.message,
        err.stack
      );
      results.error = `Critical error during collection: ${err.message}`;
      this.logWarn(
        `Returning partially collected data due to error: ${results.applications.length} apps, ${results.ports.length} ports, ${results.vms.length} VMs`
      );
      return results;
    }
  }

  /**
   * Attempts to enhance attribution for known services (both TCP and UDP)
   * @param {Object} port Port object to enhance
   * @param {Array} allApps List of all applications
   */
  _enhanceKnownPort(port, allApps) {
    const portInfo = this.importantPorts[port.host_port];
    if (!portInfo) return;

    const service = portInfo.service;

    if (service === "WireGuard" || service === "WireGuard-UI") {
      const possibleContainers = allApps.filter(
        (app) =>
          app.name.toLowerCase().includes("wireguard") ||
          app.name.toLowerCase().includes("wg-") ||
          app.name.toLowerCase().includes("wg_") ||
          app.image?.toLowerCase().includes("wireguard") ||
          app.image?.toLowerCase().includes("wg-easy")
      );

      if (possibleContainers.length === 1) {
        const container = possibleContainers[0];
        port.source = "docker";
        port.container_id = container.id;
        port.app_id = container.id;
        port.owner = container.name;
        port.target = port.host_port;
        port.created =
          container.created ||
          this.containerCreationTimeMap?.get(container.id) ||
          null;
        this.log(
          `Enhanced attribution for WireGuard port ${port.host_port} to ${container.name}`
        );
      } else if (possibleContainers.length > 0) {
        const bestMatch =
          possibleContainers.find(
            (c) => c.name === "wg-easy" || c.name === "wireguard"
          ) || possibleContainers[0];

        port.source = "docker";
        port.container_id = bestMatch.id;
        port.app_id = bestMatch.id;
        port.owner = bestMatch.name;
        port.target = port.host_port;
        port.created = bestMatch.created;
        this.log(
          `Enhanced attribution for WireGuard port ${port.host_port} to best match: ${bestMatch.name}`
        );
      }
    }
  }

  /**
   * [OPTIMIZED & COMPATIBLE] Builds a map of all process PIDs running inside host-networked
   * containers to their respective container information. This version uses standard `ps`
   * flags to ensure compatibility with systems like TrueNAS.
   * @returns {Promise<Map<number, {id: string, name: string}>>} Map of PID to container info.
   */
  async _buildHostProcToContainerMap() {
    const perf = new PerformanceTracker();
    perf.start("build-host-proc-map");
    const pidToContainerMap = new Map();

    try {
      const hostContainerIds = await this._getCachedOrFresh(
        "hostNetworkContainers",
        async () => {
          const { stdout } = await execAsync(
            `docker ps --filter network=host --format '{{.ID}}'`
          );
          return stdout.trim().split("\n").filter(Boolean);
        },
        120000 // 2 minute cache
      );

      if (hostContainerIds.length === 0) {
        perf.end("build-host-proc-map");
        return pidToContainerMap;
      }

      const dockerContainers = await this._getCachedOrFresh(
        "dockerContainers",
        () => this._getDockerContainers()
      );
      const idToNameMap = new Map(
        dockerContainers.map((c) => [c.id.substring(0, 12), c.name])
      );

      for (const containerId of hostContainerIds) {
        try {
          // Use standard, compatible ps flags. We ask for PID and command.
          const { stdout: topOutput } = await execAsync(
            `docker top ${containerId} -eo pid,comm`
          );

          const lines = topOutput.trim().split("\n").slice(1); // Skip header
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 1) continue;

            const pid = parseInt(parts[0], 10);
            const command = parts.slice(1).join(" ");

            // We are interested in the main process, not system/root processes.
            if (
              !isNaN(pid) &&
              pid > 0 &&
              command !== "sh" &&
              command !== "bash"
            ) {
              const fullId = dockerContainers.find((c) =>
                c.id.startsWith(containerId)
              )?.id;
              const containerName = idToNameMap.get(
                containerId.substring(0, 12)
              );
              if (fullId && containerName) {
                // On host-networked containers, the PID inside is the PID outside.
                pidToContainerMap.set(pid, {
                  id: fullId,
                  name: containerName,
                });
              }
            }
          }
        } catch (err) {
          // Log the error but don't crash the whole collection.
          this.logWarn(
            `Could not run 'docker top' for container ${containerId.substring(
              0,
              12
            )}. It may have stopped.`,
            err.message
          );
        }
      }
      this.log(
        `Built host process map with ${pidToContainerMap.size} PIDs from ${hostContainerIds.length} containers.`
      );
    } catch (err) {
      this.logWarn(
        "Failed to build host process to container map. Orphaned port attribution may be incomplete.",
        err.message
      );
    }

    perf.end("build-host-proc-map");
    return pidToContainerMap;
  }

  /**
   * Helper to find the parent PID of a given process.
   * @param {number} pid The process ID.
   * @returns {Promise<number|null>} The parent PID or null.
   */
  async _findParentPid(pid) {
    try {
      const { stdout } = await execAsync(`cat /proc/${pid}/status`);
      const ppidMatch = stdout.match(/^PPid:\s*(\d+)/m);
      return ppidMatch ? parseInt(ppidMatch[1], 10) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Get basic system info using Docker commands (hybrid approach)
   */
  async _getBasicSystemInfoViaDocket() {
    const perf = new PerformanceTracker();
    perf.start("basic-system-info-total");

    try {
      this.log(
        "Collecting TrueNAS system info via Docker host information (hybrid approach)"
      );

      perf.start("docker-version-info");
      const { stdout: versionOutput } = await execAsync("docker version");
      const { stdout: infoOutput } = await execAsync("docker info");
      const serverVersion = this._extractDockerVersion(versionOutput);
      const dockerInfo = this._parseDockerInfo(infoOutput);
      perf.end("docker-version-info");

      perf.start("proc-meminfo");
      let totalMemoryGB = 0;
      try {
        const { stdout: memInfo } = await execAsync("cat /proc/meminfo");
        const memTotal = memInfo.match(/MemTotal:\s+(\d+) kB/);
        if (memTotal && memTotal[1]) {
          const kbValue = parseInt(memTotal[1], 10);
          const bytesValue = kbValue * 1024;
          this.log(
            `Collected memory from /proc/meminfo: ${(
              bytesValue /
              (1024 * 1024 * 1024)
            ).toFixed(2)} GB (${bytesValue} bytes)`
          );
          totalMemoryGB = bytesValue;
        }
      } catch (memErr) {
        this.logWarn(
          "Failed to get memory info from /proc/meminfo:",
          memErr.message
        );
        totalMemoryGB = dockerInfo.memory
          ? (dockerInfo.memory / (1024 * 1024 * 1024)).toFixed(2)
          : 0;
      }
      perf.end("proc-meminfo");

      let cpuModel = "Unknown";
      try {
        const { stdout: cpuInfo } = await execAsync(
          "cat /proc/cpuinfo | grep 'model name' | head -1"
        );
        const modelMatch = cpuInfo.match(/model name\s+:\s+(.*)/);
        if (modelMatch && modelMatch[1]) {
          cpuModel = modelMatch[1].trim();
          this.log(`Collected CPU model from /proc/cpuinfo: ${cpuModel}`);
        }
      } catch (cpuErr) {
        this.logWarn(
          "Failed to get CPU model from /proc/cpuinfo:",
          cpuErr.message
        );
      }

      // Get system uptime
      let uptime = null;
      let uptimeSeconds = 0;
      try {
        const { stdout: uptimeOutput } = await execAsync("cat /proc/uptime");
        uptimeSeconds = parseFloat(uptimeOutput.split(" ")[0]);
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        uptime = days > 0 ? `${days} day${days !== 1 ? "s" : ""}, ` : "";
        uptime += `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
        this.log(
          `Collected uptime from /proc/uptime: ${uptime} (${uptimeSeconds} seconds)`
        );
      } catch (uptimeErr) {
        this.logWarn(
          "Failed to get uptime from /proc/uptime:",
          uptimeErr.message
        );
      }

      let systemProduct = "TrueNAS SCALE";
      try {
        const { stdout: dmidecode } = await execAsync(
          'dmidecode -s system-product-name 2>/dev/null || echo ""'
        );
        if (dmidecode.trim()) {
          systemProduct = dmidecode.trim();
          this.log(`Collected system product from dmidecode: ${systemProduct}`);
        }
      } catch (dmidecodeErr) {
        this.logWarn(
          "Failed to get system product from dmidecode:",
          dmidecodeErr.message
        );
      }

      // Get TrueNAS version - try multiple sources
      let truenasVersion = "";
      try {
        // First check /etc/version which should have the TrueNAS version
        const { stdout: versionFile } = await execAsync(
          'cat /etc/version 2>/dev/null || echo ""'
        );
        if (versionFile.trim()) {
          truenasVersion = versionFile.trim();
        } else if (
          dockerInfo.kernelVersion &&
          dockerInfo.kernelVersion.includes("truenas")
        ) {
          // Try to extract version from kernel if possible
          const versionMatch = dockerInfo.kernelVersion.match(
            /truenas-(\d+\.\d+\.\d+)/i
          );
          if (versionMatch && versionMatch[1]) {
            truenasVersion = versionMatch[1];
          }
        }

        if (!truenasVersion) {
          const { stdout: versionAlternative } = await execAsync(
            'cat /etc/truenas-release 2>/dev/null || echo ""'
          );
          if (versionAlternative.trim()) {
            truenasVersion = versionAlternative.trim();
          }
        }
      } catch (err) {
        this.logWarn(
          "All attempts to get TrueNAS version failed:",
          err.message
        );
      }

      const formattedOS = `TrueNAS SCALE${
        truenasVersion ? ` ${truenasVersion}` : ""
      }`;

      return {
        type: "system",
        hostname: dockerInfo.name || "truenas-system",
        platform: "truenas",
        version: truenasVersion,
        system_product: systemProduct,
        enhanced: false,
        kernel_version: dockerInfo.kernelVersion,
        operating_system: formattedOS,
        os_type: dockerInfo.osType,
        architecture: dockerInfo.architecture,
        ncpu: dockerInfo.cpus,
        memory: totalMemoryGB,
        model: cpuModel,
        uptime: uptime,
        uptime_seconds: uptimeSeconds,
        containers_running: dockerInfo.containersRunning,
        containers_total: dockerInfo.containers,
        docker_images: dockerInfo.images,
        platform_data: {
          description: `TrueNAS SCALE${
            truenasVersion ? ` ${truenasVersion}` : ""
          }`,
          deployment_method: "native",
          container_runtime: "docker",
          source: "docker-host-info",
          api_key_required_for: ["vms", "native_apps", "detailed_system_info"],
        },
      };
    } catch (err) {
      perf.end("basic-system-info-total");
      this.logError(
        "Error getting system info via Docker (hybrid approach):",
        err.message,
        err.stack
      );
      return this._getFallbackSystemInfo();
    }
  }

  /**
   * Parse Docker version output to extract server version (copied from DockerCollector)
   * @param {string} output Docker version command output
   * @returns {string} Server version
   */
  _extractDockerVersion(output) {
    const lines = output.split("\n");
    let inServerSection = false;
    for (const line of lines) {
      if (line.trim().startsWith("Server:")) {
        inServerSection = true;
        continue;
      }
      if (inServerSection && line.trim().startsWith("Version:")) {
        return line.split(":")[1].trim();
      }
    }
    return "unknown";
  }

  /**
   * Parse Docker info output to extract system information (copied from DockerCollector)
   * @param {string} output Docker info command output
   * @returns {Object} Parsed information
   */
  _parseDockerInfo(output) {
    const lines = output.split("\n");
    const info = {
      name: "",
      containersRunning: 0,
      containers: 0,
      images: 0,
      kernelVersion: "",
      operatingSystem: "",
      osType: "",
      architecture: "",
      cpus: 0,
      memory: 0,
      storageDriver: "",
      loggingDriver: "",
      cgroupDriver: "",
      swarmStatus: "inactive",
    };
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("Name:")) {
        info.name = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Containers:")) {
        info.containers = parseInt(trimmedLine.split(":")[1].trim(), 10) || 0;
      } else if (trimmedLine.startsWith("Running:")) {
        info.containersRunning =
          parseInt(trimmedLine.split(":")[1].trim(), 10) || 0;
      } else if (trimmedLine.startsWith("Images:")) {
        info.images = parseInt(trimmedLine.split(":")[1].trim(), 10) || 0;
      } else if (trimmedLine.startsWith("Kernel Version:")) {
        info.kernelVersion = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Operating System:")) {
        info.operatingSystem = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("OSType:")) {
        info.osType = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Architecture:")) {
        info.architecture = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("CPUs:")) {
        info.cpus = parseInt(trimmedLine.split(":")[1].trim(), 10) || 0;
      } else if (trimmedLine.startsWith("Total Memory:")) {
        const memParts = trimmedLine.split(":")[1].trim().split(" ");
        if (memParts.length >= 1) {
          const value = parseFloat(memParts[0]);
          const unit = memParts[1] || "B";
          if (unit.toUpperCase() === "GIB") {
            info.memory = value * 1024 * 1024 * 1024;
          } else if (unit.toUpperCase() === "MIB") {
            info.memory = value * 1024 * 1024;
          } else if (unit.toUpperCase() === "KIB") {
            info.memory = value * 1024;
          } else {
            info.memory = value;
          }
        }
      } else if (trimmedLine.startsWith("Storage Driver:")) {
        info.storageDriver = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Logging Driver:")) {
        info.loggingDriver = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Cgroup Driver:")) {
        info.cgroupDriver = trimmedLine.split(":")[1].trim();
      } else if (trimmedLine.startsWith("Swarm:")) {
        info.swarmStatus = trimmedLine.split(":")[1].trim();
      }
    }
    return info;
  }

  /**
   * Collect enhanced features using API key
   */
  async _collectEnhancedFeatures() {
    const results = {
      systemInfo: null,
      apps: [],
      vms: [],
    };
    try {
      this.logInfo("Attempting enhanced TrueNAS API calls...");
      try {
        const systemInfo = await this.client.call("system.info");
        results.systemInfo = systemInfo;
        this.logInfo("Enhanced system info retrieved");
      } catch (err) {
        this.logWarn(
          "Enhanced system info API call failed:",
          err.message.substring(0, 50)
        );
      }
      try {
        const apps = await this.client.call("app.query");
        results.apps = apps || [];
        this.logInfo(`Found ${results.apps.length} TrueNAS apps via API`);
      } catch (err) {
        this.logWarn(
          "TrueNAS apps API query failed:",
          err.message.substring(0, 50)
        );
      }
      try {
        const vms = await this.client.call("virt.instance.query");
        results.vms = vms || [];
        this.logInfo(`Found ${results.vms.length} VMs via API`);
      } catch (err) {
        this.logWarn("VM API query failed:", err.message.substring(0, 50));
      }
    } catch (err) {
      this.logError(
        "Overall enhanced features collection failed:",
        err.message,
        err.stack
      );
      throw err;
    }
    return results;
  }

  /**
   * Provides fallback system information when primary methods fail.
   * @returns {Object} Basic system information.
   */
  _getFallbackSystemInfo() {
    this.logWarn("Using fallback system information for TrueNASCollector.");
    return {
      type: "system",
      hostname: "truenas-system",
      platform: "truenas",
      version: "unknown",
      system_product: "TrueNAS SCALE",
      enhanced: false,
      kernel_version: "unknown",
      operating_system: "unknown",
      os_type: "Linux",
      architecture: "unknown",
      ncpu: 0,
      memory: 0,
      model: "Unknown",
      uptime: "N/A",
      uptime_seconds: 0,
      containers_running: 0,
      containers_total: 0,
      docker_images: 0,
      platform_data: {
        description: "TrueNAS SCALE (fallback data)",
        deployment_method: "native",
        container_runtime: "docker",
        source: "fallback",
        api_key_required_for: ["vms", "native_apps", "detailed_system_info"],
      },
    };
  }

  /**
   * Detect the network context and return appropriate IP resolution strategy
   * @returns {Object} Network context information
   */
  _detectNetworkContext() {
    try {
      const os = require("os");
      const networkInterfaces = os.networkInterfaces();
      const interfaceNames = Object.keys(networkInterfaces);
      const context = {
        hasTrueNASAppNetworks: false,
        hasDockerNetworks: false,
        hasHostNetwork: false,
        primaryInterface: null,
        recommendedIP: null,
      };
      context.hasTrueNASAppNetworks = interfaceNames.some(
        (name) =>
          name.startsWith("ix-") ||
          name.startsWith("truenas-") ||
          name.includes("app-")
      );
      context.hasDockerNetworks = interfaceNames.some(
        (name) => name.startsWith("docker") || name.startsWith("br-")
      );
      context.hasHostNetwork = interfaceNames.some((name) =>
        ["eth0", "enp", "ens", "em0"].some((prefix) => name.startsWith(prefix))
      );
      const primaryCandidates = interfaceNames.filter((name) =>
        ["eth0", "enp0s", "ens", "em0"].some((prefix) =>
          name.startsWith(prefix)
        )
      );
      if (primaryCandidates.length > 0) {
        context.primaryInterface = primaryCandidates[0];
      }
      this.log("Network context detected:", {
        truenasApp: context.hasTrueNASAppNetworks,
        docker: context.hasDockerNetworks,
        host: context.hasHostNetwork,
        primary: context.primaryInterface,
      });
      return context;
    } catch (error) {
      this.logError("Error detecting network context:", error.message);
      return {
        hasTrueNASAppNetworks: false,
        hasDockerNetworks: false,
        hasHostNetwork: true,
        primaryInterface: null,
        recommendedIP: null,
      };
    }
  }

  /**
   * Debug network interfaces and IP resolution
   */
  _debugNetworkInterfaces() {
    if (!this.debug) return;
    try {
      const os = require("os");
      const networkInterfaces = os.networkInterfaces();
      this.log("=== Network Interface Debug ===");
      for (const [name, addresses] of Object.entries(networkInterfaces)) {
        this.log(`Interface: ${name}`);
        for (const addr of addresses) {
          if (addr.family === "IPv4") {
            this.log(`  IPv4: ${addr.address} (internal: ${addr.internal})`);
          }
        }
      }
      this.log("=== End Network Debug ===");
      const context = this._detectNetworkContext();
      this.log("Network context:", context);
      const resolvedIP = "0.0.0.0";
      this.log(`Final resolved IP: ${resolvedIP}`);
    } catch (error) {
      this.logError("Error debugging network interfaces:", error.message);
    }
  }

  /**
   * Get a map of running Docker container names to their IDs
   * @returns {Promise<Map<string, string>>} Map of container names to full IDs
   */
  async _getDockerNameToIdMap() {
    try {
      const { stdout } = await execAsync(
        'docker ps --no-trunc --format "{{.Names}}\t{{.ID}}"'
      );
      const nameToId = new Map();

      stdout
        .trim()
        .split("\n")
        .forEach((line) => {
          if (line.trim()) {
            const [name, id] = line.split("\t");
            if (name && id) {
              nameToId.set(name, id);
            }
          }
        });

      return nameToId;
    } catch (err) {
      this.logWarn(
        "Failed to get Docker container name to ID map:",
        err.message
      );
      return new Map();
    }
  }

  /**
   * Generic cache wrapper for expensive operations
   * @param {string} cacheKey Cache key identifier
   * @param {Function} fetchFunction Function to call if cache miss
   * @param {number} customTimeout Optional custom timeout override
   * @returns {Promise<any>} Cached or fresh data
   */
  async _getCachedOrFresh(cacheKey, fetchFunction, customTimeout = null) {
    if (this.cacheDisabled) {
      this.log(`Cache disabled for ${cacheKey}, fetching fresh data.`);
      return await fetchFunction();
    }

    const now = Date.now();
    const timeout = customTimeout || this.cacheTimeout;
    const cached = this.cache[cacheKey];

    if (cached && cached.data && now - cached.timestamp < timeout) {
      const age = ((now - cached.timestamp) / 1000).toFixed(1);
      this.log(`Using cached ${cacheKey} data (${age}s old)`);
      return cached.data;
    }

    this.log(`Cache miss for ${cacheKey}, fetching fresh data`);
    const freshData = await fetchFunction();
    this.cache[cacheKey] = {
      data: freshData,
      timestamp: now,
    };

    return freshData;
  }

  /**
   * Clear specific cache entry
   * @param {string} cacheKey Cache key to clear
   */
  _clearCache(cacheKey) {
    if (this.cache[cacheKey]) {
      this.cache[cacheKey] = { data: null, timestamp: 0 };
      this.log(`Cleared cache for: ${cacheKey}`);
    }
  }

  /**
   * Clear all cache entries
   */
  _clearAllCache() {
    Object.keys(this.cache).forEach((key) => {
      this.cache[key] = { data: null, timestamp: 0 };
    });
    this.log("Cleared all cache entries");
  }
}

module.exports = TrueNASCollector;
