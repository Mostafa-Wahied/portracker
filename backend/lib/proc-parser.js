/**
 * /proc filesystem parser for secure port detection
 */

const fs = require('fs').promises;
const path = require('path');
const { Logger } = require('./logger');

class ProcParser {
  constructor(procPath = '/proc') {
    this.logger = new Logger("ProcParser", { debug: process.env.DEBUG === 'true' });
    
    // Check environment variable for host proc path
    const hostProcPath = process.env.HOST_PROC;
    
    // PLATFORM-ADAPTIVE PRIORITY ORDER
    // TrueNAS: /proc/net/tcp exists, /host/proc/net/tcp does NOT exist
    // macOS Docker Desktop: /host/proc/net/tcp exists, /proc/net/tcp might not
    const procPaths = [
      procPath,           // Default /proc (works on TrueNAS)
      '/proc',            // Direct /proc (TrueNAS primary)
      hostProcPath,       // Environment variable override
      '/host/proc',       // Docker mount point (macOS primary)
      '/hostproc',        // Alternative mount point
    ].filter(Boolean);    // Remove null/undefined values
    
    // Find the first accessible /proc path
    this.procPath = procPath;
    for (const testPath of procPaths) {
      try {
        require('fs').statSync(path.join(testPath, 'net', 'tcp'));
        this.procPath = testPath;
        this.logger.debug(`Using /proc path: ${this.procPath}`);
        break;
  } catch {
        // Continue to next path
      }
    }
    
    this.logger.info(`Final /proc path: ${this.procPath}`);
    
    // Important UDP ports that should always be included regardless of INCLUDE_UDP setting
    this.importantUdpPorts = [
      53,    // DNS
      67,    // DHCP Server
      68,    // DHCP Client
      123,   // NTP
      137,   // NetBIOS Name Service
      138,   // NetBIOS Datagram Service
      161,   // SNMP
      162,   // SNMP Trap
      514,   // Syslog
      500,   // IPsec IKE
      4500,  // IPsec NAT-T
      1194,  // OpenVPN
      1198,  // OpenVPN
      51820, // WireGuard
      51821, // WireGuard-UI
      51822, // WireGuard
    ];
    
    // Add containerized environment detection
    this.isContainerized = this._detectContainerizedEnvironment();
    if (this.isContainerized) {
      this.logger.debug(`Detected containerized environment, using host network namespace`);
    }
  }

  /**
   * Detect if running in containerized environment with host PID access
   */
  _detectContainerizedEnvironment() {
    try {
      // Check if we're in a container with host PID access
      const fs = require('fs');
      
      // If we can see massive number of processes, we have host PID access
      const procDirs = fs.readdirSync(this.procPath);
      const pidCount = procDirs.filter(dir => /^\d+$/.test(dir)).length;
      
      // If we see >100 processes and have /.dockerenv, we're containerized with host PID
      const hasDockerEnv = fs.existsSync('/.dockerenv');
      const hasHostPidAccess = pidCount > 100;
      
      return hasDockerEnv && hasHostPidAccess;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get network file path - use host process network namespace if containerized
   */
  _getNetworkFilePath(protocol) {
    if (this.isContainerized) {
      // Use init process (PID 1) network namespace to access host network
      return path.join(this.procPath, '1', 'net', protocol);
    }
    return path.join(this.procPath, 'net', protocol);
  }

  /**
   * Parse /proc/net/tcp and /proc/net/tcp6
   */
  async getTcpPorts() {
    const ports = [];
    
    for (const file of ['tcp', 'tcp6']) {
      try {
        const filePath = this._getNetworkFilePath(file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').slice(1); // Skip header
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;
          
          const [, localAddress, remoteAddress, state, , , , , , inode] = parts;
          
          // State 0A = LISTEN
          if (state !== '0A') continue;
          
          const [addrHex, portHex] = localAddress.split(':');
          const port = parseInt(portHex, 16);
          
          if (port === 0 || port > 65535) continue;
          
          const ip = this._parseHexAddress(addrHex);
          const processInfo = await this._findProcessByInode(parseInt(inode, 10));
          
          ports.push({
            protocol: 'tcp',
            host_ip: ip,
            host_port: port,
            inode: parseInt(inode, 10),
            pid: processInfo?.pid,
            owner: processInfo?.name || 'unknown'
          });
        }
      } catch (err) {
        this.logger.warn(`Warning reading network file ${file}:`, err.message);
      }
    }
    
    return ports;
  }

  /**
   * Parse /proc/net/udp and /proc/net/udp6 with proper filtering
   * @param {boolean} includeAll - If true, include all UDP ports. If false, only important ones
   */
  async getUdpPorts(includeAll = false) {
    const ports = [];
    
    for (const file of ['udp', 'udp6']) {
      try {
        const filePath = this._getNetworkFilePath(file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').slice(1); // Skip header
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;
          
          const [, localAddress, , , , , , , , inode] = parts;
          
          const [addrHex, portHex] = localAddress.split(':');
          const port = parseInt(portHex, 16);
          
          if (port === 0 || port > 65535) continue;
          
          // Filter UDP ports based on includeAll setting
          if (!includeAll && !this.importantUdpPorts.includes(port)) {
            continue;
          }
          
          const ip = this._parseHexAddress(addrHex);
          const processInfo = await this._findProcessByInode(parseInt(inode, 10));
          
          ports.push({
            protocol: 'udp',
            host_ip: ip,
            host_port: port,
            inode: parseInt(inode, 10),
            pid: processInfo?.pid,
            owner: processInfo?.name || 'unknown'
          });
        }
      } catch (err) {
        this.logger.warn(`Warning reading network file ${file}:`, err.message);
      }
    }
    
    return ports;
  }

  /**
   * Test if /proc parsing is working effectively
   * Returns true if we can find a reasonable number of ports
   */
  async testProcAccess() {
    try {
      // First check if we can read the TCP file at all
      const tcpPath = path.join(this.procPath, 'net', 'tcp');
      await fs.access(tcpPath, fs.constants.R_OK);
      
      // Then check if we get meaningful content
      const content = await fs.readFile(tcpPath, 'utf8');
      const lines = content.trim().split('\n');
      
      // Should have header + at least some entries
      if (lines.length < 2) {
        this.logger.warn(`/proc/net/tcp has no entries`);
        return false;
      }
      
      // Count listening ports
      let listeningPorts = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4 && parts[3] === '0A') { // State 0A = LISTEN
          listeningPorts++;
        }
      }
      
      this.logger.debug(`Found ${listeningPorts} listening TCP ports in ${this.procPath}/net/tcp`);
      
      // Also check if we can read process information
      let canReadProcesses = false;
      try {
        const testPids = await fs.readdir(this.procPath);
        const numericPids = testPids.filter(p => /^\d+$/.test(p));
        if (numericPids.length > 0) {
          // Try to read at least one process cmdline
          const testPid = numericPids[0];
          await fs.readFile(path.join(this.procPath, testPid, 'cmdline'), 'utf8');
          canReadProcesses = true;
        }
      } catch (err) {
        this.logger.warn(`Cannot read process information: ${err.message}`);
      }
      
      // In Docker environments without host network, we typically see fewer ports
      // and might not be able to read all process information
      // Return true if we can at least read the network files
      return listeningPorts >= 1 || canReadProcesses;
    } catch (err) {
      this.logger.warn(`/proc access test failed:`, err.message);
      return false;
    }
  }

  /**
   * Parse hex IP address
   */
  _parseHexAddress(hex) {
    if (hex === '00000000') return '0.0.0.0';
    
    if (hex.length === 8) {
      // IPv4 - little endian
      const bytes = [];
      for (let i = 6; i >= 0; i -= 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return bytes.join('.');
    } else if (hex.length === 32) {
      // IPv6 - for now just return ::
      return '::';
    }
    
    return '0.0.0.0';
  }

  /**
   * Find process by socket inode
   */
  async _findProcessByInode(inode) {
    if (this.isContainerized) {
      // In containerized environment, we can't reliably map inodes to processes
      // Return null to fall back to "unknown" attribution
      return null;
    }
    
    try {
      const dirs = await fs.readdir(this.procPath);
      
      for (const dir of dirs) {
        if (!/^\d+$/.test(dir)) continue;
        
        const pid = parseInt(dir, 10);
        const fdPath = path.join(this.procPath, dir, 'fd');
        
        try {
          const fds = await fs.readdir(fdPath);
          
          for (const fd of fds) {
            try {
              const link = await fs.readlink(path.join(fdPath, fd));
              if (link === `socket:[${inode}]`) {
                // Found the process
                const cmdline = await fs.readFile(
                  path.join(this.procPath, dir, 'cmdline'), 
                  'utf8'
                );
                const name = cmdline.split('\0')[0].split('/').pop() || 'unknown';
                
                return { pid, name };
              }
            } catch (err) {
              // Permission denied or broken link
            }
          }
        } catch (err) {
          // Process might have exited or permission denied
        }
      }
    } catch (err) {
      // Permission denied on /proc
      this.logger.warn(`Error reading process info: ${err.message}`);
    }
    
    return null;
  }

  /**
   * Check if a process belongs to a Docker container
   */
  async getContainerByPid(pid) {
    try {
      const cgroupPath = path.join(this.procPath, pid.toString(), 'cgroup');
      const content = await fs.readFile(cgroupPath, 'utf8');
      
      // Look for Docker container ID in cgroup
      const match = content.match(/docker[/-]([a-f0-9]{64})/);
      if (match) {
        return match[1].substring(0, 12); // Short container ID
      }
    } catch (err) {
      // Not accessible or not a container
    }
    
    return null;
  }
}

module.exports = ProcParser;