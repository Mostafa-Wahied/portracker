/**
 * PORTS TRACKER - BACKEND SERVER
 *
 * Production-ready backend server for the portracker application.
 * Provides RESTful API endpoints for server management, port scanning,
 * and system monitoring across multiple deployment platforms.
 */

const express = require("express");
const cors = require("cors");
const db = require("./db");
const { createCollector, detectCollector } = require("./collectors");
const { Logger } = require("./lib/logger");
const path = require("path");
const net = require("net");
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");

// Initialize logger for this component
const logger = new Logger("Server", { debug: process.env.DEBUG === 'true' });

const PING_TIMEOUT = 2000;

// Rate limiting for ping debug logs to prevent spam
const pingDebugStats = {
  count: 0,
  startTime: Date.now(),
  lastSummaryTime: Date.now()
};

/**
 * Logs ping debug messages with rate limiting to reduce log spam, emitting summaries every 30 seconds or when forced.
 * @param {string} message - The debug message to log.
 * @param {boolean} [force=false] - If true, logs the message regardless of rate limits.
 */
function logPingDebug(message, force = false) {
  pingDebugStats.count++;
  const now = Date.now();
  
  // Log first few pings, then summary every 30 seconds
  if (pingDebugStats.count <= 5 || force || (now - pingDebugStats.lastSummaryTime) > 30000) {
    logger.debug(message);
    
    if ((now - pingDebugStats.lastSummaryTime) > 30000) {
      const elapsed = (now - pingDebugStats.startTime) / 1000;
      logger.debug(`[PING SUMMARY] ${pingDebugStats.count} pings processed in ${elapsed.toFixed(1)}s`);
      pingDebugStats.lastSummaryTime = now;
    }
  }
}

const WELL_KNOWN_PORTS = {
  22: { name: 'SSH', type: 'system', description: 'Secure Shell (SSH)' },
  23: { name: 'Telnet', type: 'system', description: 'Telnet protocol' },
  25: { name: 'SMTP', type: 'system', description: 'Simple Mail Transfer Protocol (SMTP)' },
  53: { name: 'DNS', type: 'system', description: 'Domain Name System (DNS)' },
  80: { name: 'HTTP', type: 'web', description: 'Hypertext Transfer Protocol (HTTP)' },
  110: { name: 'POP3', type: 'system', description: 'Post Office Protocol version 3 (POP3)' },
  143: { name: 'IMAP', type: 'system', description: 'Internet Message Access Protocol (IMAP)' },
  443: { name: 'HTTPS', type: 'web', description: 'HTTP Secure (HTTPS)' },
  993: { name: 'IMAPS', type: 'system', description: 'IMAP over SSL' },
  995: { name: 'POP3S', type: 'system', description: 'POP3 over SSL' },
  1433: { name: 'SQL Server', type: 'database', description: 'Microsoft SQL Server database' },
  3306: { name: 'MySQL', type: 'database', description: 'MySQL database' },
  5432: { name: 'PostgreSQL', type: 'database', description: 'PostgreSQL database' },
  6379: { name: 'Redis', type: 'database', description: 'Redis in-memory database' },
  8080: { name: 'HTTP Alt', type: 'web', description: 'HTTP alternative port' },
  8443: { name: 'HTTPS Alt', type: 'web', description: 'HTTPS alternative port' },
  9000: { name: 'Management', type: 'web', description: 'Common management interface port' },
};

/**
 * Determines the service type and metadata for a given port and optional owner string.
 * @param {number|string} port - The port number to classify.
 * @param {string} [owner] - Optional process or service owner name for heuristic detection.
 * @return {Object} An object containing the service name, type, and description.
 */
function detectServiceType(port, owner) {
  const portNum = parseInt(port, 10);
  
  if (WELL_KNOWN_PORTS[portNum]) {
    return WELL_KNOWN_PORTS[portNum];
  }
  
  if (owner && typeof owner === 'string') {
    const ownerLower = owner.toLowerCase();
    
    if (ownerLower.includes('ssh') || ownerLower.includes('sshd')) {
      return { name: 'SSH', type: 'system', description: 'SSH service' };
    }
    if (ownerLower.includes('nginx') || ownerLower.includes('apache') || ownerLower.includes('httpd')) {
      return { name: 'Web Server', type: 'web', description: 'Web server' };
    }
    if (ownerLower.includes('mysql') || ownerLower.includes('postgres') || ownerLower.includes('redis')) {
      return { name: 'Database', type: 'database', description: 'Database service' };
    }
  }
  
  // Enhanced port range detection for web services
  if (portNum === 80 || portNum === 443 || portNum === 8080 || portNum === 8443 || 
      (portNum >= 3000 && portNum <= 3999) ||  // Common dev ports
      (portNum >= 4000 && portNum <= 4999) ||  // Common app ports
      (portNum >= 8000 && portNum <= 8999) ||  // Common web alt ports
      (portNum >= 9000 && portNum <= 9999)) {  // Management/admin ports
    return { name: 'Web Service', type: 'web', description: 'Web service' };
  }
  
  if (portNum < 1024) {
    return { name: 'System Service', type: 'system', description: 'System service' };
  }
  
  return { name: 'Service', type: 'service', description: 'Application service' };
}

/**
 * Determines the Docker host IP address for the current environment.
 *
 * Returns the appropriate host IP for Docker containers, handling Docker Desktop, macOS, Windows, and Linux environments. Attempts to extract the gateway IP from `/proc/net/route` on Linux systems; falls back to `172.17.0.1` if detection fails.
 * @return {string} The Docker host IP address.
 */
function getDockerHostIP() {
  const platform = os.platform();
  
  if (platform === 'darwin' || platform === 'win32') {
    return "host.docker.internal";
  }
  
  if (isDockerDesktopEnvironment()) {
    return "host.docker.internal";
  }
  
  try {
    if (fs.existsSync('/proc/net/route')) {
      const routes = fs.readFileSync('/proc/net/route', 'utf8');
      const lines = routes.split('\n');
      for (const line of lines) {
        const fields = line.split('\t');
        if (fields[1] === '00000000' && fields[7] === '00000000') {
          const gatewayHex = fields[2];
          const gateway = [
            parseInt(gatewayHex.substr(6, 2), 16),
            parseInt(gatewayHex.substr(4, 2), 16),
            parseInt(gatewayHex.substr(2, 2), 16),
            parseInt(gatewayHex.substr(0, 2), 16)
          ].join('.');
          return gateway;
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to detect Docker host IP from /proc/net/route:', err.message);
  }
  
  return "172.17.0.1";
}

/**
 * Determines if the current environment is Docker Desktop.
 * @return {boolean} True if running inside Docker Desktop, otherwise false.
 */
function isDockerDesktopEnvironment() {
  try {
    if (process.env.DOCKER_DESKTOP === 'true') {
      return true;
    }
    
    if (fs.existsSync('/proc/version')) {
      const version = fs.readFileSync('/proc/version', 'utf8');
      if (version.includes('linuxkit') || version.includes('docker-desktop')) {
        return true;
      }
    }
    
    if (fs.existsSync('/proc/net/route')) {
      const routes = fs.readFileSync('/proc/net/route', 'utf8');
      const gatewayLines = routes.split('\n').filter(line => {
        const fields = line.split('\t');
        return fields[1] === '00000000';
      });
      
      for (const line of gatewayLines) {
        const fields = line.split('\t');
        const gatewayHex = fields[2];
        const gateway = [
          parseInt(gatewayHex.substr(6, 2), 16),
          parseInt(gatewayHex.substr(4, 2), 16),
          parseInt(gatewayHex.substr(2, 2), 16),
          parseInt(gatewayHex.substr(0, 2), 16)
        ].join('.');
        
        if (gateway.startsWith('192.168.65.') || gateway.startsWith('172.19.') || gateway.startsWith('172.20.')) {
          return true;
        }
      }
    }
    
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Tests the reachability of a service over HTTP or HTTPS by sending HEAD and GET requests.
 *
 * Attempts a HEAD request first; if unsuccessful, falls back to a GET request. Measures response time, captures status codes, and detects single-page application (SPA) patterns in 404 HTML responses. Returns detailed information about reachability, protocol, method, response time, and SPA detection.
 *
 * @param {string} scheme - The protocol to use ("http" or "https").
 * @param {string} host_ip - The target host IP address.
 * @param {number} port - The target port number.
 * @param {string} [path="/"] - The request path.
 * @param {boolean} [isDebugEnabled=false] - Enables debug logging if true.
 * @return {Promise<Object>} An object indicating reachability, status code, protocol, method, response time, and SPA detection if applicable.
 */
async function testProtocol(scheme, host_ip, port, path = "/", isDebugEnabled = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
  
  const url = `${scheme}://${host_ip}:${port}${path}`;
  
  try {
    const startTime = Date.now();
    
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PortTracker/1.0',
        },
      });
      
      const duration = Date.now() - startTime;
      
      if (isDebugEnabled) {
        logPingDebug(
          `testProtocol HEAD ${url} -> ${headResponse.status} (${duration}ms)`
        );
      }
      
      if (headResponse.status < 500 && headResponse.status !== 404) {
        clearTimeout(timeout);
        return {
          reachable: true,
          statusCode: headResponse.status,
          protocol: scheme,
          method: 'HEAD',
          responseTime: duration,
        };
      }
    } catch (headError) {
      if (isDebugEnabled) {
        logPingDebug(
          `testProtocol HEAD ${url} failed: ${headError.message}`
        );
      }
    }
    
    try {
      const getStartTime = Date.now();
      const getResponse = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PortTracker/1.0',
        },
        redirect: 'manual'
      });
      
      const getDuration = Date.now() - getStartTime;
      
      if (isDebugEnabled) {
        logPingDebug(
          `testProtocol GET ${url} -> ${getResponse.status} (${getDuration}ms)`
        );
      }
      
      if (getResponse.status < 500) {
        let isSPA = false;
        
        if (getResponse.status === 404) {
          try {
            const body = await getResponse.text();
            const contentType = getResponse.headers.get('content-type') || '';
            
            if (contentType.includes('text/html') && body.length > 100) {
              const hasDoctype = body.toLowerCase().includes('<!doctype html>') || body.toLowerCase().includes('<html');
              const hasScriptTags = body.toLowerCase().includes('<script');
              const hasMetaTags = body.toLowerCase().includes('<meta');
              const hasAppRoot = body.includes('id="root"') || body.includes('id="app"') || body.includes('id=\'root\'') || body.includes('id=\'app\'');
              
              isSPA = hasDoctype && hasScriptTags && (hasAppRoot || hasMetaTags);
              
              if (isDebugEnabled && isSPA) {
                logPingDebug(
                  `testProtocol detected SPA pattern in 404 response for ${url}`
                );
              }
            }
          } catch (bodyError) {
            if (isDebugEnabled) {
              logPingDebug(
                `testProtocol failed to read body for SPA detection: ${bodyError.message}`
              );
            }
          }
        }
        
        clearTimeout(timeout);
        return {
          reachable: true,
          statusCode: getResponse.status,
          protocol: scheme,
          method: 'GET',
          responseTime: getDuration,
          isSPA: isSPA
        };
      }
    } catch (getError) {
      if (isDebugEnabled) {
        logPingDebug(
          `testProtocol GET ${url} failed: ${getError.message}`
        );
      }
    }
    
    clearTimeout(timeout);
    return { reachable: false, error: 'No successful response' };
    
  } catch (error) {
    clearTimeout(timeout);
    return { reachable: false, error: error.message };
  }
}

/**
 * Determines the status and accessibility of a service based on its type and HTTP(S) response data.
 *
 * Evaluates the service type and the results of HTTP and HTTPS protocol checks to classify the service as accessible, listening, unreachable, or in error. Returns a status object with color coding, descriptive title, and protocol information when applicable.
 *
 * @param {Object} serviceInfo - Metadata about the service, including type, name, and description.
 * @param {Object} httpsResponse - Result of the HTTPS protocol check, including reachability and status code.
 * @param {Object} httpResponse - Result of the HTTP protocol check, including reachability and status code.
 * @return {Object} An object describing the service's status, color, title, description, and protocol if relevant.
 */
function determineServiceStatus(serviceInfo, httpsResponse, httpResponse) {
  const serviceType = serviceInfo.type;
  
  if (serviceType === 'system') {
    return {
      status: 'system',
      color: 'gray',
      title: `${serviceInfo.name} - System service`,
      description: serviceInfo.description
    };
  }
  
  let workingResponse = null;
  
  if (httpsResponse.reachable && httpsResponse.statusCode >= 200 && httpsResponse.statusCode < 300) {
    workingResponse = httpsResponse;
  } else if (httpResponse.reachable && httpResponse.statusCode >= 200 && httpResponse.statusCode < 300) {
    workingResponse = httpResponse;
  } else if (httpsResponse.reachable) {
    workingResponse = httpsResponse;
  } else if (httpResponse.reachable) {
    workingResponse = httpResponse;
  }
  
  if (!workingResponse) {
    return {
      status: 'unreachable',
      color: 'red',
      title: `${serviceInfo.name} - Service not reachable`,
      description: serviceInfo.description
    };
  }
  
  if (serviceType === 'web') {
    const statusCode = workingResponse.statusCode;
    
    if (statusCode >= 200 && statusCode < 400) {
      return {
        status: 'accessible',
        color: 'green',
        title: `${serviceInfo.name} - Web service accessible`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode === 401) {
      return {
        status: 'accessible',
        color: 'green', 
        title: `${serviceInfo.name} - Web accessible (auth)`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode === 403) {
      return {
        status: 'listening',
        color: 'yellow',
        title: `${serviceInfo.name} - Listening (Forbidden)`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode === 405 && workingResponse.method === 'HEAD') {
      return {
        status: 'accessible',
        color: 'green',
        title: `${serviceInfo.name} - Web accessible (GET)`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode === 404) {
      if (workingResponse.isSPA) {
        return {
          status: 'accessible',
          color: 'green',
          title: `${serviceInfo.name} - Web accessible`,
          description: serviceInfo.description,
          protocol: workingResponse.protocol
        };
      } else {
        return {
          status: 'listening',
          color: 'yellow',
          title: `${serviceInfo.name} - Listening (no web UI)`,
          description: serviceInfo.description,
          protocol: workingResponse.protocol
        };
      }
    }
    
    if (statusCode >= 400 && statusCode < 500) {
      return {
        status: 'accessible',
        color: 'green',
        title: `${serviceInfo.name} - Web accessible (HTTP ${statusCode})`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode >= 500) {
      return {
        status: 'error',
        color: 'red',
        title: `${serviceInfo.name} - HTTP ${statusCode} error`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
  }
  
  if (serviceType === 'database' || serviceType === 'service') {
    const statusCode = workingResponse.statusCode;
    
    if (statusCode === 401) {
      return {
        status: 'accessible',
        color: 'green',
        title: `${serviceInfo.name} - HTTP accessible (auth)`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode === 403) {
      return {
        status: 'listening',
        color: 'yellow',
        title: `${serviceInfo.name} - Listening (Forbidden)`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    }
    
    if (statusCode < 500) {
      return {
        status: 'accessible',
        color: 'green',
        title: `${serviceInfo.name} - HTTP accessible`,
        description: serviceInfo.description,
        protocol: workingResponse.protocol
      };
    } else {
      return {
        status: 'listening',
        color: 'yellow',
        title: `${serviceInfo.name} - Service listening (not HTTP)`,
        description: serviceInfo.description
      };
    }
  }
  
  return {
    status: 'listening',
    color: 'yellow',
    title: `${serviceInfo.name} - Service listening`,
    description: serviceInfo.description
  };
}

// Verify database schema before starting the server
try {
  const columns = db.prepare("PRAGMA table_info(servers)").all();
  const columnNames = columns.map((col) => col.name);

  if (!columnNames.includes("type")) {
    logger.warn(
      'Database schema migration may be needed. The "servers" table "type" column is missing.'
    );
    logger.warn(
      "This might affect functionality. Consider checking database setup or migrations."
    );
  } else {
    logger.info("Database schema verification successful.");
  }
  db.ensureLocalServer(process.env.PORT || 3000);
} catch (error) {
  logger.fatal("Database verification failed:", error.message);
  logger.debug("Stack trace:", error.stack || "");
}

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
let debug = false;

/**
 * Get all ports from local system using collector framework.
 */
app.get("/api/ports", async (req, res) => {
  const debug = req.query.debug === "true";
  // Enable debug for this request if specified
  if (debug) logger.setDebugEnabled(true);
  
  logger.debug(`GET /api/ports called with debug=${debug}`);
  
  try {
    const entries = [];
    const dockerCollector = createCollector("docker", { debug });
    const dockerPorts = await dockerCollector.getPorts();
    entries.push(...dockerPorts);
    const systemCollector = createCollector("system", { debug });
    const systemPorts = await systemCollector.getPorts();
    entries.push(...systemPorts);

    const normalized = entries
      .filter((e) => e.host_port && e.host_ip)
      .reduce((acc, entry) => {
        const key = `${entry.host_ip}:${entry.host_port}`;
        if (!acc[key]) {
          acc[key] = {
            ...entry,
            owners: [entry.owner],
            pids: [entry.pid].filter(Boolean),
          };
        } else {
          if (!acc[key].owners.includes(entry.owner)) {
            acc[key].owners.push(entry.owner);
          }
          if (entry.pid && !acc[key].pids.includes(entry.pid)) {
            acc[key].pids.push(entry.pid);
          }
        }
        return acc;
      }, {});

    res.json(
      Object.values(normalized).map((e) => ({
        ...e,
        owner: e.owners.join(", "),
      }))
    );
  } catch (error) {
    logger.error("Error in GET /api/ports:", error.message);
    logger.debug("Stack trace:", error.stack || "");
    res
      .status(500)
      .json({ error: "Failed to scan ports", details: error.message });
  } finally {

    if (debug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

/**
 * New peer-based endpoint to replace remote API connectivity
 */
app.get("/api/all-ports", async (req, res) => {
  const debug = req.query.debug === "true";
  // Enable debug for this request if specified
  if (debug) logger.setDebugEnabled(true);
  
  logger.debug(`GET /api/all-ports called with debug=${debug}`);
  
  try {
    const servers = db.prepare("SELECT * FROM servers").all();

    const results = servers.map((s) => ({
      id: s.id,
      server: s.label,
      ok: s.id === "local",
      error: s.id !== "local" ? "Peer communication not yet implemented" : null,
      data: s.id === "local" ? [] : [],
      parentId: s.parentId,
      platform_type: s.platform_type || "unknown",
    }));

    const localServerResult = results.find((s) => s.id === "local");
    if (localServerResult) {
      try {
        const localPorts = await getLocalPortsUsingCollectors({ debug });
        localServerResult.data = localPorts;
        localServerResult.ok = true;
      } catch (localError) {
        logger.error("Failed to get local ports for /api/all-ports:", localError.message);
        localServerResult.ok = false;
        localServerResult.error = `Failed to collect local ports: ${localError.message}`;
      }
    }

    res.json(results);
  } catch (error) {
    logger.error("Error in GET /api/all-ports:", error.message);
    logger.debug("Stack trace:", error.stack || "");
    res
      .status(500)
      .json({ error: "Failed to process all ports", details: error.message });
  } finally {

    if (debug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

/**
 * Collects and returns the list of open ports on the local system using the most suitable platform-specific collector.
 * @param {Object} [options] - Optional settings for port collection.
 * @param {boolean} [options.debug] - Enables debug logging if true.
 * @return {Promise<Array>} Resolves with an array of port information objects.
 */
async function getLocalPortsUsingCollectors(options = {}) {
  const currentDebug = options.debug || false;

  try {
    logger.debug("[getLocalPortsUsingCollectors] Starting port collection...");

    const collector = await detectCollector({ debug: currentDebug });
    logger.debug(`[getLocalPortsUsingCollectors] Detected collector: ${collector?.platform}`);

    const ports = await collector.getPorts();
    logger.debug(`[getLocalPortsUsingCollectors] Collected ${ports?.length || 0} ports.`);
    
    return ports;
  } catch (error) {
    logger.error("[getLocalPortsUsingCollectors] Primary collection attempt failed:", error.message);
    logger.debug("Stack trace:", error.stack || "");
    throw error;
  }
}

/**
 * New endpoint to scan a server with the appropriate collector
 */
app.get("/api/servers/:id/scan", async (req, res) => {
  const serverId = req.params.id;
  const currentDebug = req.query.debug === "true";
  
  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);
  
  logger.debug(`GET /api/servers/${serverId}/scan called with debug=${currentDebug}`);

  try {
    const server = db
      .prepare("SELECT * FROM servers WHERE id = ?")
      .get(serverId);

    if (!server) {
      logger.warn(`[GET /api/servers/${serverId}/scan] Server not found.`);
      return res.status(404).json({ error: "Server not found" });
    }

    if (serverId === "local") {
      const platformType = server.platform_type || "auto";
      let collector;

      logger.debug(`[GET /api/servers/local/scan] Local server platform_type: ${platformType}`);

      if (platformType === "auto") {
        collector = await detectCollector({ debug: currentDebug });
      } else {
        collector = createCollector(platformType, { debug: currentDebug });
      }

      const collectData = await collector.collectAll();

      if (collectData.ports && Array.isArray(collectData.ports)) {
        const enrichedPorts = collectData.ports.map((port) => {
          const noteEntry = db
            .prepare(
              "SELECT note FROM notes WHERE server_id = 'local' AND host_ip = ? AND host_port = ?"
            )
            .get(port.host_ip, port.host_port);
          const ignoreEntry = db
            .prepare(
              "SELECT 1 FROM ignores WHERE server_id = 'local' AND host_ip = ? AND host_port = ?"
            )
            .get(port.host_ip, port.host_port);
          return {
            ...port,
            note: noteEntry ? noteEntry.note : null,
            ignored: !!ignoreEntry,
          };
        });
        collectData.ports = enrichedPorts;
      }

      if (
        platformType === "auto" &&
        collectData.platform &&
        server.platform_type !== collectData.platform
      ) {
        db.updateLocalServerPlatformType(collectData.platform);
      }
      logger.debug(
        `Local scan complete. Collector: ${
          collector?.platform
        }, Apps: ${collectData.apps?.length || 0}, Ports: ${
          collectData.ports?.length || 0
        }, VMs: ${collectData.vms?.length || 0}`
      );
      return res.json(collectData);
    }

    if (server.type === "peer" && server.url) {
      logger.debug(`[GET /api/servers/${serverId}/scan] Attempting to scan remote peer at URL: ${server.url}`);
      
      try {
        const peerScanUrl = new URL("/api/servers/local/scan", server.url).href;
        logger.debug(`[GET /api/servers/${serverId}/scan] Fetching from peer URL: ${peerScanUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const peerResponse = await fetch(peerScanUrl, { 
            signal: controller.signal 
          });
          clearTimeout(timeoutId);

          if (!peerResponse.ok) {
            let errorBody = "Peer responded with an error.";
            try {
              errorBody = await peerResponse.text();
            } catch (e) {
              /* ignore */
            }
            logger.warn(
              `[GET /api/servers/${serverId}/scan] Peer server at ${server.url} responded with status ${peerResponse.status}. Body: ${errorBody}`
            );
            return res.status(peerResponse.status).json({
              error: `Peer server scan failed with status ${peerResponse.status}`,
              details: errorBody,
              serverId: serverId,
              peerUrl: server.url,
            });
          }

          const peerScanData = await peerResponse.json();
          logger.debug(`Peer scan complete: ${server.label} (${serverId})`);
          return res.json(peerScanData);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            logger.error(
              `[GET /api/servers/${serverId}/scan] Timeout after 15s communicating with peer ${server.label} at ${server.url}`
            );
            return res.status(408).json({
              error: "Request timeout - peer server took too long to respond",
              details: "Connection timed out after 15 seconds",
              serverId: serverId,
              peerUrl: server.url,
            });
          }
          throw fetchError;
        }
      } catch (fetchError) {
        logger.error(
          `[GET /api/servers/${serverId}/scan] Failed to fetch scan data from peer ${server.label} at ${server.url}: ${fetchError.message}`
        );
        return res.status(502).json({
          error: "Failed to communicate with peer server",
          details: fetchError.message,
          serverId: serverId,
          peerUrl: server.url,
        });
      }
    } else {
      logger.warn(
        `[GET /api/servers/${serverId}/scan] Cannot scan server: Not 'local' and not a valid 'peer' with a URL.`
      );
      return res.status(501).json({
        error:
          "Server scanning not possible for this server type or configuration",
        server_id: serverId,
      });
    }
  } catch (error) {
    logger.error(`Error in GET /api/servers/${serverId}/scan: ${error.message}`);
    logger.debug("Stack trace:", error.stack || "");
    res
      .status(500)
      .json({ error: "Failed to scan server", details: error.message });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

function validateServerInput(req, res, next) {
  const { label, url, type, platform_type } = req.body;
  if (!label || typeof label !== "string" || label.trim().length === 0) {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details: "Field 'label' is required and must be a non-empty string",
        field: "label",
      });
  }
  if (
    type === "peer" &&
    url &&
    typeof url === "string" &&
    url.trim().length > 0
  ) {
    try {
      new URL(url.trim());
    } catch (e) {
      return res
        .status(400)
        .json({
          error: "Validation failed",
          details:
            "Field 'url' must be a valid URL format if provided for a peer",
          field: "url",
        });
    }
  } else if (
    type === "peer" &&
    (!url || url.trim().length === 0) &&
    !req.body.unreachable
  ) {
    // A reachable peer must have a URL. This is validated in the POST /api/servers endpoint
  }

  req.body.type = type || "peer";
  req.body.platform_type = platform_type || "unknown";
  req.body.label = label.trim();
  req.body.url = url ? url.trim() : null;
  next();
}

function validateNoteInput(req, res, next) {
  const { server_id, host_ip, host_port, note } = req.body;
  if (!server_id || typeof server_id !== "string") {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details: "Field 'server_id' is required and must be a string",
        field: "server_id",
      });
  }
  if (!host_ip || typeof host_ip !== "string") {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details: "Field 'host_ip' is required and must be a string",
        field: "host_ip",
      });
  }
  if (
    host_port === undefined ||
    host_port === null ||
    !Number.isInteger(Number(host_port))
  ) {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details:
          "Field 'host_port' is required and must be a valid port number",
        field: "host_port",
      });
  }
  const serverExists = db
    .prepare("SELECT id FROM servers WHERE id = ?")
    .get(server_id);
  if (!serverExists) {
    return res
      .status(404)
      .json({
        error: "Validation failed",
        details: `Server with id '${server_id}' not found`,
        field: "server_id",
      });
  }
  next();
}

/**
 * Middleware that validates the presence and format of the server ID parameter in the request.
 * Responds with a 400 error if the ID is missing or not a non-empty string.
 */
function validateServerIdParam(req, res, next) {
  const serverId = req.params.id;
  if (
    !serverId ||
    typeof serverId !== "string" ||
    serverId.trim().length === 0
  ) {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details:
          "Server ID parameter is required and must be a non-empty string",
        field: "id",
      });
  }
  next();
}

app.get("/api/servers", (req, res) => {
  logger.debug("GET /api/servers");
  try {
    const stmt = db.prepare(
      "SELECT id, label, url, parentId, type, unreachable, platform_type FROM servers"
    );
    const servers = stmt.all();
    logger.debug(`Returning ${servers.length} servers`);
    res.json(servers);
  } catch (error) {
    logger.error("Failed to get servers:", error.message);
    logger.debug("Stack trace:", error.stack || "");
    res
      .status(500)
      .json({ error: "Failed to retrieve servers", details: error.message });
  }
});

app.post("/api/servers", validateServerInput, (req, res) => {
  const { id, label, url, parentId, type, unreachable, platform_type } =
    req.body;

  if (!id) {
    return res.status(400).json({ error: "Field 'id' is required" });
  }

  if (type === "peer" && !unreachable && (!url || url.trim().length === 0)) {
    return res
      .status(400)
      .json({
        error: "Validation failed",
        details: "Field 'url' is required for reachable peer servers",
        field: "url",
      });
  }

  const dbUnreachable = unreachable ? 1 : 0;

  try {
    const existing = db.prepare("SELECT id FROM servers WHERE id = ?").get(id);
    if (existing) {
      db.prepare(
        "UPDATE servers SET label = ?, url = ?, parentId = ?, type = ?, unreachable = ?, platform_type = ? WHERE id = ?"
      ).run(
        label,
        url,
        parentId || null,
        type,
        dbUnreachable,
        platform_type,
        id
      );
      logger.info(`Server updated successfully. ID: ${id}, Label: "${label}"`);
      res.status(200).json({ message: "Server updated successfully", id });
    } else {
      db.prepare(
        "INSERT INTO servers (id, label, url, parentId, type, unreachable, platform_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        label,
        url,
        parentId || null,
        type,
        dbUnreachable,
        platform_type
      );
      logger.info(`Server added successfully. ID: ${id}, Label: "${label}"`);
      res.status(201).json({ message: "Server added successfully", id });
    }
  } catch (error) {
    logger.error(`Database error in POST /api/servers (ID: ${id}): ${error.message}`);
    logger.debug("Stack trace:", error.stack || "");
    if (error.message.includes("UNIQUE constraint failed")) {
      return res
        .status(409)
        .json({ error: `Server with ID '${id}' already exists.` });
    }
    if (
      error.message.toLowerCase().includes("can only bind") ||
      error.message.toLowerCase().includes("datatype mismatch")
    ) {
      logger.error(
        `Possible data binding/type issue for server ID ${id}. Payload received: ${JSON.stringify(req.body)}`
      );
      return res
        .status(500)
        .json({
          error: "Failed to save server due to data type issue.",
          details: error.message,
        });
    }
    res
      .status(500)
      .json({ error: "Failed to save server", details: error.message });
  }
});

app.delete("/api/servers/:id", validateServerIdParam, (req, res) => {
  const serverId = req.params.id;
  const currentDebug = req.query.debug === "true";
  
  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);

  logger.debug(`[DELETE /api/servers/${serverId}] Request received.`);

  try {
    const server = db
      .prepare("SELECT id, label FROM servers WHERE id = ?")
      .get(serverId);
    if (!server) {
      logger.warn(`[DELETE /api/servers/${serverId}] Attempt to delete non-existent server.`);
      return res
        .status(404)
        .json({ error: "Server not found", server_id: serverId });
    }

    if (serverId === "local") {
      logger.warn(`[DELETE /api/servers/${serverId}] Attempt to delete 'local' server.`);
      return res
        .status(400)
        .json({ error: "Cannot delete local server", server_id: serverId });
    }

    const deleteTransaction = db.transaction(() => {
      db.prepare("UPDATE servers SET parentId = NULL WHERE parentId = ?").run(
        serverId
      );
      db.prepare("DELETE FROM notes WHERE server_id = ?").run(serverId);
      db.prepare("DELETE FROM ignores WHERE server_id = ?").run(serverId);
      db.prepare("DELETE FROM servers WHERE id = ?").run(serverId);
    });
    deleteTransaction();

    logger.info(`Server deleted successfully. ID: ${serverId}, Label: "${server.label}"`);
    res.json({
      success: true,
      message: `Server '${server.label}' (ID: ${serverId}) deleted successfully`,
    });
  } catch (err) {
    if (err.message.includes("FOREIGN KEY constraint failed")) {
      logger.error(`FOREIGN KEY constraint failed during DELETE /api/servers/${serverId}: ${err.message}`);
      logger.debug("Stack trace:", err.stack || "");
      return res.status(409).json({
        error: "Conflict deleting server",
        details:
          "Cannot delete server due to existing references. Ensure all child items or dependencies are handled.",
        rawError: err.message,
      });
    }
    logger.error(`Database error in DELETE /api/servers/${serverId}: ${err.message}`);
    logger.debug("Stack trace:", err.stack || "");
    res
      .status(500)
      .json({
        error: "Database operation failed",
        details: "Unable to delete server",
        rawError: err.message,
      });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

app.post("/api/notes", validateNoteInput, (req, res) => {
  const { server_id, host_ip, host_port, note } = req.body;
  const currentDebug = req.query.debug === "true";
  const noteTrimmed = note ? note.trim() : "";

  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);

  logger.debug(`POST /api/notes for ${server_id} ${host_ip}:${host_port}. Note: "${noteTrimmed}"`);

  try {
    const existing = db
      .prepare(
        "SELECT server_id FROM notes WHERE server_id = ? AND host_ip = ? AND host_port = ?"
      )
      .get(server_id, host_ip, host_port);
    if (existing) {
      if (noteTrimmed === "") {
        db.prepare(
          "DELETE FROM notes WHERE server_id = ? AND host_ip = ? AND host_port = ?"
        ).run(server_id, host_ip, host_port);
        logger.info(`Note deleted for ${server_id} ${host_ip}:${host_port}`);
      } else {
        db.prepare(
          "UPDATE notes SET note = ?, updated_at = datetime('now') WHERE server_id = ? AND host_ip = ? AND host_port = ?"
        ).run(noteTrimmed, server_id, host_ip, host_port);
        logger.info(`Note updated for ${server_id} ${host_ip}:${host_port}`);
      }
    } else if (noteTrimmed !== "") {
      db.prepare(
        "INSERT INTO notes (server_id, host_ip, host_port, note) VALUES (?, ?, ?, ?)"
      ).run(server_id, host_ip, host_port, noteTrimmed);
      logger.info(`Note created for ${server_id} ${host_ip}:${host_port}`);
    }
    res.status(200).json({ success: true, message: "Note saved successfully" });
  } catch (err) {
    logger.error(`Database error in POST /api/notes: ${err.message}`);
    logger.debug("Stack trace:", err.stack || "");
    res
      .status(500)
      .json({
        error: "Database operation failed",
        details: "Unable to save note",
      });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

app.get("/api/notes", (req, res) => {
  const { server_id } = req.query;
  const currentDebug = req.query.debug === "true";

  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);

  logger.debug(`GET /api/notes for server_id: ${server_id}`);

  if (!server_id) {
    return res
      .status(400)
      .json({ error: "server_id query parameter is required" });
  }

  try {
    const notes = db
      .prepare("SELECT host_ip, host_port, note FROM notes WHERE server_id = ?")
      .all(server_id);
    res.json(notes);
  } catch (err) {
    logger.error(`Database error in GET /api/notes: ${err.message}`);
    logger.debug("Stack trace:", err.stack || "");
    res
      .status(500)
      .json({
        error: "Database operation failed",
        details: "Unable to retrieve notes",
      });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

app.post("/api/ignores", (req, res) => {
  const { server_id, host_ip, host_port, ignored } = req.body;
  const currentDebug = req.query.debug === "true";

  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);

  logger.debug(`POST /api/ignores for ${server_id} ${host_ip}:${host_port}. Ignored: ${ignored}`);

  if (
    !server_id ||
    typeof server_id !== "string" ||
    !host_ip ||
    typeof host_ip !== "string" ||
    host_port === undefined ||
    host_port === null ||
    !Number.isInteger(Number(host_port)) ||
    typeof ignored !== "boolean"
  ) {
    return res.status(400).json({ error: "Invalid input for ignore entry" });
  }

  try {
    const existing = db
      .prepare(
        "SELECT server_id FROM ignores WHERE server_id = ? AND host_ip = ? AND host_port = ?"
      )
      .get(server_id, host_ip, host_port);

    if (ignored) {
      if (!existing) {
        db.prepare(
          "INSERT INTO ignores (server_id, host_ip, host_port) VALUES (?, ?, ?)"
        ).run(server_id, host_ip, host_port);
        logger.info(`Port ignored for ${server_id} ${host_ip}:${host_port}`);
      } else {
        logger.debug(`Port already ignored for ${server_id} ${host_ip}:${host_port}, no change.`);
      }
    } else {
      if (existing) {
        db.prepare(
          "DELETE FROM ignores WHERE server_id = ? AND host_ip = ? AND host_port = ?"
        ).run(server_id, host_ip, host_port);
        logger.info(`Port un-ignored for ${server_id} ${host_ip}:${host_port}`);
      } else {
        logger.debug(`Port already not ignored for ${server_id} ${host_ip}:${host_port}, no change.`);
      }
    }
    res.status(200).json({ success: true, message: "Ignore status updated" });
  } catch (err) {
    logger.error(`Database error in POST /api/ignores: ${err.message}`);
    logger.debug("Stack trace:", err.stack || "");
    res
      .status(500)
      .json({
        error: "Database operation failed",
        details: "Unable to update ignore status",
      });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

app.get("/api/ignores", (req, res) => {
  const { server_id } = req.query;
  const currentDebug = req.query.debug === "true";

  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);

  logger.debug(`GET /api/ignores for server_id: ${server_id}`);

  if (!server_id) {
    return res
      .status(400)
      .json({ error: "server_id query parameter is required" });
  }

  try {
    const ignores = db
      .prepare("SELECT host_ip, host_port FROM ignores WHERE server_id = ?")
      .all(server_id);
    res.json(ignores.map((item) => ({ ...item, ignored: true })));
  } catch (err) {
    logger.error(`Database error in GET /api/ignores: ${err.message}`);
    logger.debug("Stack trace:", err.stack || "");
    res
      .status(500)
      .json({
        error: "Database operation failed",
        details: "Unable to retrieve ignores",
      });
  } finally {

    if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
  }
});

app.get("/api/ping", async (req, res) => {
  const { host_ip, host_port, target_server_url, owner } = req.query;
  const currentDebug = req.query.debug === "true";
  
  // Enable debug for this request if specified
  if (currentDebug) logger.setDebugEnabled(true);
  
  if (!host_ip || !host_port) {
    return res
      .status(400)
      .json({ error: "host_ip and host_port are required" });
  }
  const portNum = parseInt(host_port, 10);
  if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
    return res.status(400).json({ error: "Invalid host_port" });
  }
  
  const serviceInfo = detectServiceType(host_port, owner);
  
  if (serviceInfo.type === 'system') {
    return res.json({
      reachable: true,
      status: 'system',
      color: 'gray',
      title: serviceInfo.description,
      serviceType: serviceInfo.type,
      serviceName: serviceInfo.name
    });
  }

  let pingable_host_ip = host_ip;
  
  const isInDocker = process.env.RUNNING_IN_DOCKER === "true" || 
                     fs.existsSync("/.dockerenv") || 
                     fs.existsSync("/proc/self/cgroup") && 
                     fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  if (
    target_server_url &&
    (host_ip === "0.0.0.0" ||
      host_ip === "127.0.0.1" ||
      host_ip === "[::]" ||
      host_ip === "[::1]")
  ) {
    try {
      const peerUrlObj = new URL(target_server_url);
      pingable_host_ip = peerUrlObj.hostname;
      logPingDebug(
        `Using peer server hostname '${pingable_host_ip}' for generic host_ip '${host_ip}' on port ${host_port}`
      );
    } catch (e) {
      logger.error(`[GET /api/ping] Invalid target_server_url: ${target_server_url} - ${e.message}`);
    }
  } else if (
    (host_ip === "0.0.0.0" ||
      host_ip === "127.0.0.1" ||
      host_ip === "[::]" ||
      host_ip === "[::1]")
  ) {
    if (isInDocker) {
      const dockerHostIP = getDockerHostIP();
      pingable_host_ip = dockerHostIP;
      logPingDebug(
        `Detected Docker environment, using host IP '${dockerHostIP}' for port ${host_port}`
      );
    } else {
      pingable_host_ip = "localhost";
      logPingDebug(
      );
    }
  } else {
    logPingDebug(`Using provided host_ip '${host_ip}' for port ${host_port}`);
  }
  
  // Only log service testing for first few pings or important services
  const isImportantService = serviceInfo.type !== 'service' || portNum <= 1024;
  if (currentDebug && (pingDebugStats.count <= 3 || isImportantService)) {
    logger.debug(`Testing ${serviceInfo.name} (${serviceInfo.type}) on ${pingable_host_ip}:${portNum}`);
  }

  const httpsResponse = await testProtocol("https", pingable_host_ip, portNum, "/", currentDebug);
  const httpResponse = await testProtocol("http", pingable_host_ip, portNum, "/", currentDebug);
  
  const result = determineServiceStatus(serviceInfo, httpsResponse, httpResponse);
  
  // Only log results for first few pings or failures
  if (currentDebug && (pingDebugStats.count <= 3 || result.status === 'unreachable')) {
    logger.debug(`Service status for ${pingable_host_ip}:${portNum} -> ${result.status} (${result.color})`);
  }
  
  res.json({
    reachable: result.status !== 'unreachable',
    status: result.status,
    color: result.color,
    title: result.title,
    protocol: result.protocol || null,
    serviceType: serviceInfo.type,
    serviceName: serviceInfo.name,
    description: result.description
  });
  

  if (currentDebug) logger.setDebugEnabled(process.env.DEBUG === 'true');
});

app.get("/api/health", (req, res) => {
  logger.debug("Health check requested");
  try {
    const dbCheck = db.prepare("SELECT 1").get();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    logger.debug("Health check successful");
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptime,
      memory: { rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB` },
      database: "connected",
    });
  } catch (error) {
    logger.error("Health check failed:", error.message);
    logger.debug("Stack trace:", error.stack || "");
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      database: "disconnected_or_error",
    });
  }
});

const staticPath = path.join(__dirname, "public");
logger.info(`Attempting to serve static files from: ${staticPath}`);
app.use(express.static(staticPath, { fallthrough: true, index: false }));

app.get("*", (req, res, next) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  logger.debug(`Serving frontend for path: ${req.path}`);
  res.sendFile(indexPath, (err) => {
    if (err) {
      logger.error(`Failed to send ${indexPath} for ${req.path}: ${err.message}`);
      if (!res.headersSent) {
        res.status(404).json({
          error: "Frontend entry point not found",
          details: `Could not serve ${indexPath}. Ensure frontend is built and in public directory. Error: ${err.message}`,
        });
      }
    } else {
      logger.debug(`Successfully served frontend for ${req.path}`);
    }
  });
});

app.use((err, req, res, next) => {
  logger.fatal("Unhandled error in Express middleware:", err.stack || err.message);
  if (!res.headersSent) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  } else {
    next(err);
  }
});

logger.info(`About to call app.listen on port ${PORT}`);
try {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server is now listening on http://0.0.0.0:${PORT}`);
    logger.info("Full startup message complete.");
  });
} catch (listenError) {
  logger.fatal("app.listen failed to start:", listenError.message);
  logger.debug("Stack trace:", listenError.stack || "");
  process.exit(1);
}

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  logger.fatal("Uncaught Exception:", error.stack || error.message);
  process.exit(1);
});
