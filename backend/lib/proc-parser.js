/** /proc filesystem parser for secure port detection */

const fs = require('fs').promises;
const path = require('path');
const { Logger } = require('./logger');

class ProcParser {
  constructor(procPath = '/proc') {
    this.logger = new Logger("ProcParser", { debug: process.env.DEBUG === 'true' });
    
    const hostProcPath = process.env.HOST_PROC;
    
    const procPaths = [
      procPath,
      '/proc',
      hostProcPath,
      '/host/proc',
      '/hostproc',
    ].filter(Boolean);
    
    this.procPath = procPath;
    for (const testPath of procPaths) {
      try {
        require('fs').statSync(path.join(testPath, 'net', 'tcp'));
        this.procPath = testPath;
        this.logger.debug(`Using /proc path: ${this.procPath}`);
        break;
  } catch {
    /* /proc path not accessible - will try next path */
      }
    }
    
    this.logger.info(`Final /proc path: ${this.procPath}`);
    
    this.importantUdpPorts = [
  53,
  67,
  68,
  123,
  137,
  138,
  161,
  162,
  514,
  500,
  4500,
  1194,
  1198,
  51820,
  51821,
  51822,
    ];
    
    this.isContainerized = this._detectContainerizedEnvironment();
    if (this.isContainerized) {
      this.logger.debug(`Detected containerized environment, using host network namespace`);
    }
  }

  /** Detect if running in containerized environment with host PID access */
  _detectContainerizedEnvironment() {
    try {
      const fs = require('fs');
      
      const procDirs = fs.readdirSync(this.procPath);
      const pidCount = procDirs.filter(dir => /^\d+$/.test(dir)).length;
      
      const hasDockerEnv = fs.existsSync('/.dockerenv');
      const hasHostPidAccess = pidCount > 100;
      
      return hasDockerEnv && hasHostPidAccess;
    } catch (err) {
      this.logger.debug("Error checking containerization status:", { error: err.message });
      return false;
    }
  }

  /** Get network file path - uses host PID namespace when containerized */
  _getNetworkFilePath(protocol) {
    if (this.isContainerized) {
      return path.join(this.procPath, '1', 'net', protocol);
    }
    return path.join(this.procPath, 'net', protocol);
  }

  /** Parse /proc/net/tcp and /proc/net/tcp6 */
  async getTcpPorts() {
    const ports = [];
    
    for (const file of ['tcp', 'tcp6']) {
      try {
        const filePath = this._getNetworkFilePath(file);
        const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n').slice(1);
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;

          const localAddress = parts[1];
          const state = parts[3];
          const inode = parts[9];

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

  /** Parse /proc/net/udp and /proc/net/udp6 with proper filtering */
  async getUdpPorts(includeAll = false) {
    const ports = [];
    
    for (const file of ['udp', 'udp6']) {
      try {
        const filePath = this._getNetworkFilePath(file);
        const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n').slice(1);
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;

          const localAddress = parts[1];
          const inode = parts[9];

          const [addrHex, portHex] = localAddress.split(':');
          const port = parseInt(portHex, 16);

          if (port === 0 || port > 65535) continue;

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

  /** Test if /proc parsing is working effectively */
  async testProcAccess() {
    try {
      const tcpPath = path.join(this.procPath, 'net', 'tcp');
      await fs.access(tcpPath, fs.constants.R_OK);
      
      const content = await fs.readFile(tcpPath, 'utf8');
      const lines = content.trim().split('\n');
      
      if (lines.length < 2) {
        this.logger.warn(`/proc/net/tcp has no entries`);
        return false;
      }
      
      let listeningPorts = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4 && parts[3] === '0A') {
          listeningPorts++;
        }
      }
      
      this.logger.debug(`Found ${listeningPorts} listening TCP ports in ${this.procPath}/net/tcp`);
      
      let canReadProcesses = false;
      try {
        const testPids = await fs.readdir(this.procPath);
        const numericPids = testPids.filter(p => /^\d+$/.test(p));
        if (numericPids.length > 0) {
          const testPid = numericPids[0];
          await fs.readFile(path.join(this.procPath, testPid, 'cmdline'), 'utf8');
          canReadProcesses = true;
        }
      } catch (err) {
        this.logger.warn(`Cannot read process information: ${err.message}`);
      }
      
      return listeningPorts >= 1 || canReadProcesses;
    } catch (err) {
      this.logger.warn(`/proc access test failed:`, err.message);
      return false;
    }
  }

  /** Parse hex IP address */
  _parseHexAddress(hex) {
    if (hex === '00000000') return '0.0.0.0';
    
    if (hex.length === 8) {
      const bytes = [];
      for (let i = 6; i >= 0; i -= 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return bytes.join('.');
    } else if (hex.length === 32) {
      return '::';
    }
    
    return '0.0.0.0';
  }

  /** Find process by socket inode */
  async _findProcessByInode(inode) {
    if (this.isContainerized) {
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
                const cmdline = await fs.readFile(
                  path.join(this.procPath, dir, 'cmdline'), 
                  'utf8'
                );
                const name = cmdline.split('\0')[0].split('/').pop() || 'unknown';
                
                return { pid, name };
              }
            } catch {
              /* Process directory not accessible - will try next */
            }
          }
        } catch {
          /* /proc/pid/fd directory not accessible */
        }
      }
    } catch (err) {
      this.logger.warn(`Error reading process info: ${err.message}`);
    }
    
    return null;
  }

  /** Check if a process belongs to a Docker container */
  async getContainerByPid(pid) {
    try {
      const cgroupPath = path.join(this.procPath, pid.toString(), 'cgroup');
      const content = await fs.readFile(cgroupPath, 'utf8');
      
      const match = content.match(/docker[/-]([a-f0-9]{64})/);
      if (match) {
  return match[1].substring(0, 12);
      }
    } catch {
      /* /proc/pid/cgroup file not accessible */
    }
    
    return null;
  }
}

module.exports = ProcParser;