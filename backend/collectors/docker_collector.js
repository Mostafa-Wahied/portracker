/**
 * PORTS TRACKER - DOCKER COLLECTOR
 *
 * This collector gathers data from Docker installations.
 * It implements the standard collector interface defined in base_collector.js.
 * Based on the original Docker scanner but with enhanced capabilities.
 */

const BaseCollector = require("./base_collector");
const { exec } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);
const fs = require("fs");
const os = require("os");

class DockerCollector extends BaseCollector {
  /**
   * Create a new Docker collector
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super(config);
    this.platform = "docker";
    this.platformName = "Docker";
    this.name = "Docker Collector";
  }

  /**
   * Get Docker system information
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    try {
      const { stdout: versionOutput } = await execAsync("docker version");
      const { stdout: infoOutput } = await execAsync("docker info");
      const serverVersion = this._extractDockerVersion(versionOutput);
      const info = this._parseDockerInfo(infoOutput);
      return {
        type: "system",
        hostname: info.name || "docker-host",
        version: serverVersion || "unknown",
        platform: "docker",
        docker_version: serverVersion,
        containers_running: info.containersRunning || 0,
        containers_total: info.containers || 0,
        images: info.images || 0,
        kernel_version: info.kernelVersion,
        operating_system: info.operatingSystem,
        os_type: info.osType,
        architecture: info.architecture,
        ncpu: info.cpus || 0,
        memory: info.memory || 0,
        platform_data: {
          description: `Docker ${serverVersion}`,
          storage_driver: info.storageDriver,
          logging_driver: info.loggingDriver,
          cgroup_driver: info.cgroupDriver,
          swarm_status: info.swarmStatus || "inactive",
        },
      };
    } catch (err) {
      this.logError(
        "Error collecting Docker system info:",
        err.message,
        err.stack
      );
      return {
        type: "system",
        hostname: "Unknown Docker host",
        version: "unknown",
        platform: "docker",
        error: err.message,
      };
    }
  }

  /**
   * Parse Docker version output to extract server version
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
   * Parse Docker info output to extract system information
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
        const memString = trimmedLine.split(":")[1].trim();
        const valueMatch = memString.match(/([\d.]+)/);

        if (valueMatch) {
          let value = parseFloat(valueMatch[1]);
          const unit = (memString.match(/[a-zA-Z]+/) || [""])[0].toUpperCase();

          const unitMap = {
            GIB: 1024 * 1024 * 1024,
            GB: 1000 * 1000 * 1000,
            MIB: 1024 * 1024,
            MB: 1000 * 1000,
            KIB: 1024,
            KB: 1000,
            B: 1,
          };

          if (unitMap[unit]) {
            info.memory = Math.round(value * unitMap[unit]);
          } else {
            if (value < 1024) {
              info.memory = Math.round(value * 1024 * 1024 * 1024);
            } else {
              info.memory = Math.round(value);
            }
          }
        } else {
          info.memory = 0;
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
   * Parse `docker ps` output to extract port information.
   * @param {string} output The raw output from the `docker ps` command.
   * @returns {Array} A list of normalized port entries.
   */
  parseDockerOutput(output) {
    const entries = [];
    if (!output) return entries;

    const lines = output.trim().split("\n");
    for (const line of lines) {
      if (!line) continue;

      const [name, portsStr, id] = line.split(":::");
      if (!portsStr) continue;

      const portMappings = portsStr.split(", ");
      for (const mapping of portMappings) {
        const [hostPart, targetPart] = mapping.split("->");
        if (!hostPart || !targetPart) continue;

        const targetMatch = targetPart.match(/(\d+)\/(tcp|udp)/);
        if (!targetMatch) continue;

        const targetPort = parseInt(targetMatch[1], 10);
        const protocol = targetMatch[2];

        const lastColonIndex = hostPart.lastIndexOf(":");
        if (lastColonIndex === -1) continue;

        const hostIp = hostPart.substring(0, lastColonIndex);
        const hostPort = parseInt(hostPart.substring(lastColonIndex + 1), 10);

        if (!hostIp || isNaN(hostPort)) continue;

        entries.push(
          this.normalizePortEntry({
            source: "docker",
            owner: name,
            protocol: protocol,
            host_ip: hostIp,
            host_port: hostPort,
            target: targetPort,
            container_id: id,
            app_id: id,
            pids: [],
          })
        );
      }
    }
    return entries;
  }

  /**
   * Get Docker applications (containers)
   * @returns {Promise<Array>} List of applications
   */
  async getApplications() {
    try {
      const { stdout } = await execAsync('docker ps -a --format "{{json .}}"');
      const containers = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      return containers.map((container) => ({
        type: "application",
        id: container.ID,
        name: container.Names,
        status: container.State,
        version: "N/A",
        image: container.Image,
        command: container.Command,
        created: container.CreatedAt,
        platform: "docker",
        platform_data: {
          type: "container",
          size: container.Size,
          mounts: container.Mounts,
          networks: container.Networks,
        },
      }));
    } catch (err) {
      this.logError(
        "Error collecting Docker applications:",
        err.message,
        err.stack
      );
      return [
        {
          type: "application",
          name: "Docker containers collection failed",
          error: err.message,
          platform: "docker",
        },
      ];
    }
  }

  /**
   * Get Docker network ports (hybrid: both container and system)
   * @returns {Promise<Array>} List of port entries
   */
  async getPorts() {
    try {
      const allPorts = [];
      const dockerPortsMap = new Map();
      const dockerProcessMap = new Map();
      const containerCreationTimeMap = new Map(); // Add this

      try {
        // Get container creation times
        const dockerContainers = await this.getApplications();
        dockerContainers.forEach((container) => {
          if (container.created) {
            containerCreationTimeMap.set(container.id, container.created);
          }
        });

        const dockerPorts = await this._getDockerContainerPorts();
        dockerPorts.forEach((port) => {
          const key = `${port.host_ip}:${port.host_port}`;
          if (!dockerPortsMap.has(key)) {
            // Add created timestamp from container
            if (port.container_id) {
              port.created = containerCreationTimeMap.get(port.container_id) || null;
            }
            dockerPortsMap.set(key, port);
            allPorts.push(port);
          }
        });

        const allRunningContainers = await this._getHostNetworkContainers();
        allRunningContainers.forEach((container) => {
          if (container.pids && container.pids.length > 0) {
            container.pids.forEach((pid) => {
              dockerProcessMap.set(pid, container);
            });
          }
        });
      } catch (dockerErr) {
        this.logWarn("Failed to collect Docker container-specific data:", dockerErr.message);
      }

      try {
        const systemPorts = await this._getSystemPorts();

        for (const port of systemPorts) {
          const key = `${port.host_ip}:${port.host_port}`;
          if (dockerPortsMap.has(key)) {
            continue;
          }

          let dockerInfo = null;

          if (port.pids && port.pids.length > 0) {
            for (const pid of port.pids) {
              if (dockerProcessMap.has(pid)) {
                const container = dockerProcessMap.get(pid);
                dockerInfo = {
                  containerName: container.name,
                  containerId: container.id,
                  target: `${container.id.substring(0, 12)}:internal(host-net)`,
                };
                // Add created timestamp for host-networked containers
                port.created = containerCreationTimeMap.get(container.id) || null;
                break;
              }
            }
          }

          if (!dockerInfo) {
            dockerInfo = await this._checkIfPortBelongsToDocker(port);
            if (dockerInfo && dockerInfo.containerId) {
              port.created = containerCreationTimeMap.get(dockerInfo.containerId) || null;
            }
          }

          if (dockerInfo) {
            const dockerPort = this.normalizePortEntry({
              ...port,
              source: "docker",
              owner: dockerInfo.containerName,
              target: dockerInfo.target,
              container_id: dockerInfo.containerId,
              app_id: dockerInfo.containerName,
            });

            if (!dockerPortsMap.has(key)) {
              allPorts.push(dockerPort);
              dockerPortsMap.set(key, dockerPort);
            }
          } else {
            allPorts.push(port);
          }
        }
      } catch (systemErr) {
        this.logWarn("Failed to collect and process system ports:", systemErr.message);
      }

      this.logInfo(`Total unique ports collected: ${allPorts.length}`);
      return allPorts;
    } catch (err) {
      this.logError("Critical error in getPorts:", err.message, err.stack);
      return [
        {
          type: "port",
          error: `Critical error in getPorts: ${err.message}`,
          platform: "docker",
        },
      ];
    }
  }

  /**
   * Get Docker container ports with explicit port mappings
   * @returns {Promise<Array>} Docker port entries
   * @private
   */
  async _getDockerContainerPorts() {
    try {
      const { stdout: dockerOutput } = await execAsync(
        'docker ps --format "{{.Names}}:::{{.Ports}}:::{{.ID}}"'
      );
      return this.parseDockerOutput(dockerOutput);
    } catch (err) {
      this.logWarn("Failed to get Docker container ports:", err.message);
      return [];
    }
  }

  /**
   * Get containers that might be using host networking.
   * This version is optimized to run inspections in parallel for better performance.
   * @returns {Promise<Array>} Container information
   * @private
   */
  async _getHostNetworkContainers() {
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.ID}}:::{{.Names}}:::{{.Image}}"'
      );
      const lines = stdout.trim().split("\n").filter(Boolean);

      if (lines.length === 0) {
        return [];
      }

      const promises = lines.map(async (line) => {
        const [containerId, containerName, image] = line.split(":::");

        try {
          const [inspectResult, pids] = await Promise.all([
            execAsync(
              `docker inspect ${containerId} --format "{{.HostConfig.NetworkMode}}:::{{json .Config.ExposedPorts}}"`
            ),
            this._getContainerProcesses(containerId),
          ]);

          const inspectOutput = inspectResult.stdout.trim();
          const parts = inspectOutput.split(":::");
          const networkMode = parts[0];
          const exposedPortsJson =
            parts.length > 1 ? parts.slice(1).join(":::") : "null";

          let exposedPorts;
          try {
            exposedPorts = JSON.parse(exposedPortsJson);
          } catch (e) {
            this.logWarn(
              `Could not parse ExposedPorts JSON for container ${containerId}: ${exposedPortsJson}`
            );
            exposedPorts = null;
          }

          return {
            id: containerId,
            name: containerName,
            image: image,
            networkMode: networkMode,
            exposedPorts: exposedPorts,
            pids: pids,
          };
        } catch (inspectErr) {
          this.logWarn(
            `Failed to inspect or get processes for container ${containerId} (${containerName}):`,
            inspectErr.message
          );
          return null;
        }
      });

      const containers = (await Promise.all(promises)).filter(Boolean);
      return containers;
    } catch (err) {
      this.logWarn("Failed to get host network containers:", err.message);
      return [];
    }
  }

  /**
   * Get process IDs running inside a container
   * @param {string} containerId Container ID
   * @returns {Promise<Array>} Array of PIDs
   * @private
   */
  async _getContainerProcesses(containerId) {
    try {
      const { stdout } = await execAsync(`docker top ${containerId} -o pid`);
      const lines = stdout.trim().split("\n");
      const pids = lines
        .slice(1)
        .map((line) => parseInt(line.trim(), 10))
        .filter((pid) => !isNaN(pid));
      return pids;
    } catch (err) {
      this.logWarn(
        `Failed to get processes for container ${containerId}:`,
        err.message
      );
      return [];
    }
  }

  /**
   * Check if a system port belongs to a Docker container. This is a fallback method.
   * The primary PID-based matching is now done in getPorts.
   * @param {Object} port Port information
   * @returns {Promise<Object|null>} Docker information if found
   * @private
   */
  async _checkIfPortBelongsToDocker(port) {
    try {
      const { stdout: portCheck } = await execAsync(
        `docker ps --filter "publish=${port.host_port}" --format "{{.Names}}:::{{.ID}}" 2>/dev/null || echo ""`
      );

      if (portCheck.trim()) {
        const [containerName, containerId] = portCheck.trim().split(":::");
        return {
          containerName: containerName,
          containerId: containerId,
          target: `${containerId.substring(0, 12)}:${port.host_port}`,
        };
      }

      if (port.owner && port.owner !== "unknown") {
        const containerInfo = await this._getContainerByProcessName(
          port.owner,
          port.host_port
        );
        if (containerInfo) {
          return containerInfo;
        }
      }

      return null;
    } catch (err) {
      this.logWarn(
        `Error in _checkIfPortBelongsToDocker for port ${port.host_port}:`,
        err.message
      );
      return null;
    }
  }

  /**
   * Get container information by PID
   * @param {number} pid Process ID
   * @returns {Promise<Object|null>} Container information
   * @private
   */
  async _getContainerByPid(pid) {
    try {
      const { stdout: cgroupOutput } = await execAsync(
        `cat /proc/${pid}/cgroup 2>/dev/null || echo ""`
      );

      if (
        cgroupOutput.includes("docker") ||
        cgroupOutput.includes("containerd")
      ) {
        const dockerMatch = cgroupOutput.match(/docker[\/\-]([a-f0-9]{64})/);
        const containerdMatch = cgroupOutput.match(
          /containerd[\/\-]([a-f0-9]{64})/
        );

        const fullContainerId = dockerMatch
          ? dockerMatch[1]
          : containerdMatch
          ? containerdMatch[1]
          : null;

        if (fullContainerId) {
          const { stdout: nameOutput } = await execAsync(
            `docker ps --filter "id=${fullContainerId}" --format "{{.Names}}" 2>/dev/null || echo ""`
          );
          const containerName = nameOutput.trim();

          if (containerName) {
            return {
              containerName: containerName,
              containerId: fullContainerId,
              target: `${fullContainerId.substring(0, 12)}:internal`,
            };
          }
        }
      }

      return null;
    } catch (err) {
      this.logWarn(`Error getting container by PID ${pid}:`, err.message);
      return null;
    }
  }

  /**
   * Get container information by process name
   * @param {string} processName Process name
   * @param {number} port Port number
   * @returns {Promise<Object|null>} Container information
   * @private
   */
  async _getContainerByProcessName(processName, port) {
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.Names}}:::{{.ID}}:::{{.Image}}"'
      );

      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const [containerName, containerId, image] = line.split(":::");

        const nameLower = containerName.toLowerCase();
        const imageLower = image.toLowerCase();
        const processLower = processName.toLowerCase();

        if (
          (nameLower.includes("portracker") ||
            imageLower.includes("portracker")) &&
          (processLower.includes("node") || processLower.includes("portracker"))
        ) {
          return {
            containerName: containerName,
            containerId: containerId,
            target: `${containerId.substring(0, 12)}:${port}`,
          };
        }

        if (
          nameLower.includes(processLower) ||
          imageLower.includes(processLower) ||
          processLower.includes(nameLower.replace(/[^a-z0-9]/g, ""))
        ) {
          return {
            containerName: containerName,
            containerId: containerId,
            target: `${containerId.substring(0, 12)}:${port}`,
          };
        }
      }

      return null;
    } catch (err) {
      this.logWarn(
        `Error getting container by process name ${processName}:`,
        err.message
      );
      return null;
    }
  }

  /**
   * Get system ports using same logic as SystemCollector
   * @returns {Promise<Array>} System port entries
   * @private
   */
  async _getSystemPorts() {
    const isWindows = os.platform() === "win32";

    if (isWindows) {
      return await this._getWindowsSystemPorts();
    } else {
      return await this._getLinuxSystemPorts();
    }
  }

  /**
   * Get Linux system ports
   * @returns {Promise<Array>} System port entries
   * @private
   */
  async _getLinuxSystemPorts() {
    try {
      this.logInfo('Attempting to get Linux ports with "ss -tulnp" command');
      const { stdout } = await execAsync("ss -tulnp");
      return this._parseLinuxSystemOutput(stdout);
    } catch (err) {
      this.logWarn(
        `Linux "ss" command failed: ${err.message}. Trying "netstat" as fallback.`
      );
      try {
        this.logInfo(
          'Attempting to get Linux ports with "netstat -tulnp" command (fallback)'
        );
        const { stdout } = await execAsync("netstat -tulnp");
        return this._parseLinuxSystemOutput(stdout, true);
      } catch (fallbackErr) {
        this.logError(
          `Linux "netstat" fallback also failed: ${fallbackErr.message}`
        );
        return [];
      }
    }
  }

  /**
   * Get Windows system ports
   * @returns {Promise<Array>} System port entries
   * @private
   */
  async _getWindowsSystemPorts() {
    try {
      this.logInfo(
        'Attempting to get Windows ports with "netstat -ano" command'
      );
      const { stdout } = await execAsync("netstat -ano");
      return this._parseWindowsSystemOutput(stdout);
    } catch (err) {
      this.logWarn(
        `Windows "netstat -ano" failed: ${err.message}. Trying "netstat -an" as fallback.`
      );
      try {
        const { stdout } = await execAsync("netstat -an");
        return this._parseWindowsSystemOutput(stdout);
      } catch (fallbackErr) {
        this.logError(
          `Windows "netstat -an" fallback also failed: ${fallbackErr.message}`
        );
        return [];
      }
    }
  }

  /**
   * Parse Linux system command output (ss or netstat) with enhanced process detection
   * @param {string} output Command output
   * @param {boolean} isNetstat Whether this is netstat output (vs ss)
   * @returns {Array} Parsed port entries
   * @private
   */
  _parseLinuxSystemOutput(output, isNetstat = false) {
    const entries = [];
    const lines = output.split("\n");

    const startIndex = isNetstat ? 2 : 1;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(/\s+/);
      if (cols.length < 4) continue;

      const protocol = cols[0].toLowerCase();
      if (!protocol.includes("tcp") && !protocol.includes("udp")) continue;

      const localAddr = isNetstat ? cols[3] : cols[4];
      if (!localAddr || !localAddr.includes(":")) continue;

      let host_ip, portStr;
      if (localAddr.includes("[") && localAddr.includes("]:")) {
        const m = localAddr.match(/\[([^\]]+)\]:(\d+)/);
        if (!m) continue;
        host_ip = m[1];
        portStr = m[2];
      } else {
        const idx = localAddr.lastIndexOf(":");
        if (idx === -1) continue;
        host_ip = localAddr.slice(0, idx);
        portStr = localAddr.slice(idx + 1);
      }

      const host_port = parseInt(portStr, 10);
      if (isNaN(host_port) || host_port <= 0 || host_port > 65535) continue;

      let owner = "unknown";
      let pid = null;
      if (!isNetstat && cols.length > 6) {
        const proc = cols[cols.length - 1];
        const m2 = proc.match(/\("([^"]+)",pid=(\d+)/);
        if (m2) {
          owner = m2[1];
          pid = parseInt(m2[2], 10);
        }
      } else if (isNetstat && cols.length > 6) {
        const proc = cols[cols.length - 1];
        const m3 = proc.match(/(\d+)\/(.+)/);
        if (m3) {
          pid = parseInt(m3[1], 10);
          owner = m3[2];
        }
      }

      entries.push(
        this.normalizePortEntry({
          source: "system",
          owner,
          protocol: protocol.includes("tcp") ? "tcp" : "udp",
          host_ip: host_ip === "*" ? "0.0.0.0" : host_ip,
          host_port,
          target: null,
          container_id: null,
          app_id: null,
          pids: pid !== null ? [pid] : [],
        })
      );
    }

    return entries;
  }

  /**
   * Parse Windows system command output (netstat)
   * @param {string} output Command output
   * @returns {Array} Parsed port entries
   * @private
   */
  _parseWindowsSystemOutput(output) {
    const entries = [];
    const lines = output.split("\n");

    for (let i = 4; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(/\s+/);
      if (cols.length < 4) continue;

      const protocol = cols[0].toLowerCase();
      if (!protocol.includes("tcp") && !protocol.includes("udp")) continue;

      const localAddr = cols[1];
      if (!localAddr || !localAddr.includes(":")) continue;

      const lastColon = localAddr.lastIndexOf(":");
      if (lastColon === -1) continue;

      const host_ip = localAddr.substring(0, lastColon);
      const portStr = localAddr.substring(lastColon + 1);
      const port = parseInt(portStr, 10);

      if (isNaN(port) || port <= 0 || port > 65535) continue;

      let pid = null;
      if (cols.length > 4) {
        const pidStr = cols[cols.length - 1];
        const pidNum = parseInt(pidStr, 10);
        if (!isNaN(pidNum)) pid = pidNum;
      }

      entries.push(
        this.normalizePortEntry({
          source: "system",
          owner: "unknown",
          protocol: protocol.includes("tcp") ? "tcp" : "udp",
          host_ip: host_ip === "0.0.0.0" ? "0.0.0.0" : host_ip,
          host_port: port,
          target: null,
          container_id: null,
          app_id: null,
          pids: pid ? [pid] : [],
        })
      );
    }

    return entries;
  }

  /**
   * Check if Docker is available with confidence score
   * @returns {Promise<number>} Confidence score 0-100
   */
  async isCompatible() {
    this.logInfo("--- Docker Collector Compatibility Check ---");

    try {
      const stats = await fs.promises.stat("/var/run/docker.sock");
      if (stats.isSocket()) {
        this.logInfo(
          "Docker socket found at /var/run/docker.sock. Assigning compatibility score (50)."
        );
        return 50;
      }
    } catch (e) {
      this.logWarn("Could not stat /var/run/docker.sock. Is it mounted?");
    }

    try {
      await execAsync("docker version");
      this.logInfo(
        "Docker command is available on the host. Assigning compatibility score (40)."
      );
      return 40;
    } catch (err) {
      this.logInfo("Docker command not found or failed.");
    }

    this.logInfo("No Docker indicators found. Incompatible (score 0).");
    return 0;
  }

  /**
   * Store detection information for API access
   * @param {Object} info Detection information
   */
  setDetectionInfo(info) {
    this.detectionInfo = info;
  }
}

module.exports = DockerCollector;
