/** /proc filesystem parser for secure port detection */

const fs = require('fs').promises;
const path = require('path');
const { Logger } = require('./logger');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ProcParser {
  constructor(procPath = '/proc') {
    this.logger = new Logger("ProcParser", { debug: process.env.DEBUG === 'true' });
    
    const hostProcPath = process.env.HOST_PROC;
    if (hostProcPath) {
      try {
        require('fs').statSync(path.join(hostProcPath, 'net', 'tcp'));
        this.procPath = hostProcPath;
        this.logger.debug(`Using /proc path from HOST_PROC: ${this.procPath}`);
      } catch (e) {
        this.logger.warn(`HOST_PROC provided but unusable (${hostProcPath}): ${e.message}`);
        this.procPath = procPath;
      }
    }

    const procPaths = [
      hostProcPath,
      '/host/proc',
      '/hostproc',
      procPath,
      '/proc',
    ].filter(Boolean);
    
    this.procPath = this.procPath || procPath;
    for (const testPath of procPaths) {
      try {
        require('fs').statSync(path.join(testPath, 'net', 'tcp'));
        this.procPath = testPath;
        this.logger.debug(`Using /proc path: ${this.procPath}`);
        break;
  } catch {
      ;
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
  const prelim = [];
  const inodeMap = await this._buildInodeMap();
  let resolvedOwners = 0;
    
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
          const inodeNum = parseInt(inode, 10);
          const processInfo = inodeMap.get(inodeNum);
          if (processInfo && processInfo.name) resolvedOwners++;

          const entry = {
            protocol: 'tcp',
            host_ip: ip,
            host_port: port,
            inode: inodeNum,
            pid: processInfo?.pid,
            owner: processInfo?.name || 'unknown'
          };
          ports.push(entry);
          prelim.push({ inode: inodeNum });
        }
      } catch (err) {
        this.logger.warn(`Warning reading network file ${file}:`, err.message);
      }
    }
    this.logger.debug(`TCP parse complete: ports=${ports.length}, ownersResolved=${resolvedOwners}, inodeMapSize=${inodeMap.size}`);

    const needFallback = ports.length > 0 && resolvedOwners < Math.floor(ports.length * 0.5);
    if (needFallback) {
      const targetInodes = new Set(prelim.map(p => p.inode));
      const fallbackMap = await this._buildInodeMapForInodes(targetInodes);
      let addResolved = 0;
      for (const p of ports) {
        if (!p.owner || p.owner === 'unknown') {
          const info = fallbackMap.get(p.inode);
          if (info) {
            p.owner = info.name;
            p.pid = info.pid;
            addResolved++;
          }
        }
      }
      this.logger.debug(`TCP targeted fd-scan fallback resolved additional=${addResolved}`);

      if (addResolved < Math.ceil(ports.length * 0.25)) {
        const ssMap = await this._buildInodeMapViaSS(targetInodes, ['tcp', 'tcp6']);
        let ssResolved = 0;
        for (const p of ports) {
          if (!p.owner || p.owner === 'unknown') {
            const info = ssMap.get(p.inode);
            if (info) {
              p.owner = info.name;
              p.pid = info.pid;
              ssResolved++;
            }
          }
        }
        this.logger.debug(`TCP ss-based fallback resolved additional=${ssResolved}`);
      }
    }
    
    return ports;
  }

  /** Parse /proc/net/udp and /proc/net/udp6 with proper filtering */
  async getUdpPorts(includeAll = false) {
  const ports = [];
  const prelim = [];
  const inodeMap = await this._buildInodeMap();
  let resolvedOwners = 0;
    
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
          const inodeNum = parseInt(inode, 10);
          const processInfo = inodeMap.get(inodeNum);
          if (processInfo && processInfo.name) resolvedOwners++;

          const entry = {
            protocol: 'udp',
            host_ip: ip,
            host_port: port,
            inode: inodeNum,
            pid: processInfo?.pid,
            owner: processInfo?.name || 'unknown'
          };
          ports.push(entry);
          prelim.push({ inode: inodeNum });
        }
      } catch (err) {
        this.logger.warn(`Warning reading network file ${file}:`, err.message);
      }
    }
    this.logger.debug(`UDP parse complete: ports=${ports.length}, ownersResolved=${resolvedOwners}, inodeMapSize=${inodeMap.size}`);

    const needFallback = ports.length > 0 && resolvedOwners < Math.floor(ports.length * 0.5);
    if (needFallback) {
      const targetInodes = new Set(prelim.map(p => p.inode));
      const fallbackMap = await this._buildInodeMapForInodes(targetInodes);
      let addResolved = 0;
      for (const p of ports) {
        if (!p.owner || p.owner === 'unknown') {
          const info = fallbackMap.get(p.inode);
          if (info) {
            p.owner = info.name;
            p.pid = info.pid;
            addResolved++;
          }
        }
      }
      this.logger.debug(`UDP targeted fd-scan fallback resolved additional=${addResolved}`);

      if (addResolved < Math.ceil(ports.length * 0.25)) {
        const ssMap = await this._buildInodeMapViaSS(targetInodes, ['udp', 'udp6']);
        let ssResolved = 0;
        for (const p of ports) {
          if (!p.owner || p.owner === 'unknown') {
            const info = ssMap.get(p.inode);
            if (info) {
              p.owner = info.name;
              p.pid = info.pid;
              ssResolved++;
            }
          }
        }
        this.logger.debug(`UDP ss-based fallback resolved additional=${ssResolved}`);
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
              ;
            }
          }
        } catch {
          ;
        }
      }
    } catch (err) {
      this.logger.warn(`Error reading process info: ${err.message}`);
    }
    
    return null;
  }

  /**
   * Build a cached map of socket inode -> { pid, name }
   * - Caches for a short duration to avoid repeated /proc scans
   * - Uses /proc/[pid]/comm for clean process name; falls back to cmdline
   */
  async _buildInodeMap() {
    const now = Date.now();
  const ttlMs = 2000;
    if (this._inodeMap && this._inodeMapTs && now - this._inodeMapTs < ttlMs) {
      return this._inodeMap;
    }

    const map = new Map();
    const roots = Array.from(new Set([
      this.procPath,
      '/host/proc',
      '/proc',
    ]));

    let totalPids = 0;
    for (const root of roots) {
      let pids;
      try {
        pids = await fs.readdir(root);
      } catch {
        continue;
      }

      totalPids += pids.filter(p => /^\d+$/.test(p)).length;

      for (const dir of pids) {
        if (!/^\d+$/.test(dir)) continue;
        const pid = parseInt(dir, 10);
        const fdPath = path.join(root, dir, 'fd');

        let procName = 'unknown';
        try {
          const comm = await fs.readFile(path.join(root, dir, 'comm'), 'utf8');
          procName = comm.trim() || 'unknown';
        } catch {
          try {
            const cmdline = await fs.readFile(path.join(root, dir, 'cmdline'), 'utf8');
            const first = (cmdline.split('\0')[0] || '').trim();
            if (first) {
              procName = first.split('/').pop();
            }
          } catch {
            void 0;
          }
        }

        try {
          const fds = await fs.readdir(fdPath);
          for (const fd of fds) {
            try {
              const link = await fs.readlink(path.join(fdPath, fd));
              const m = link.match(/^socket:\[(\d+)\]$/);
              if (m) {
                const inode = parseInt(m[1], 10);
                if (!Number.isNaN(inode)) {
                  if (!map.has(inode)) map.set(inode, { pid, name: procName });
                }
              }
            } catch {
              void 0;
            }
          }
        } catch {
          void 0;
        }
      }
    }

    this._inodeMap = map;
    this._inodeMapTs = now;
    this.logger.debug(`Built inode map: entries=${map.size}, totalPidsSeen=${totalPids}, roots=${roots.join(',')}`);
    return map;
  }

  async _buildInodeMapForInodes(targetInodes) {
    const map = new Map();
    if (!targetInodes || targetInodes.size === 0) return map;
    const roots = Array.from(new Set([
      this.procPath,
      '/host/proc',
      '/proc',
    ]));
    let matched = 0;
    let pidsSeen = 0;
    let fdsChecked = 0;
    for (const root of roots) {
      let pids;
      try {
        pids = await fs.readdir(root);
      } catch {
        continue;
      }
      for (const dir of pids) {
        if (!/^\d+$/.test(dir)) continue;
        pidsSeen++;
        const pid = parseInt(dir, 10);
        const fdPath = path.join(root, dir, 'fd');
        let procName = 'unknown';
        try {
          const comm = await fs.readFile(path.join(root, dir, 'comm'), 'utf8');
          procName = comm.trim() || 'unknown';
        } catch {
          try {
            const cmdline = await fs.readFile(path.join(root, dir, 'cmdline'), 'utf8');
            const first = (cmdline.split('\0')[0] || '').trim();
            if (first) procName = first.split('/').pop();
          } catch {
            void 0;
          }
        }
        try {
          const fds = await fs.readdir(fdPath);
          for (const fd of fds) {
            fdsChecked++;
            try {
              const link = await fs.readlink(path.join(fdPath, fd));
              const m = link.match(/^socket:\[(\d+)\]$/);
              if (m) {
                const inode = parseInt(m[1], 10);
                if (targetInodes.has(inode) && !map.has(inode)) {
                  map.set(inode, { pid, name: procName });
                  matched++;
                  if (matched >= targetInodes.size) break;
                }
              }
            } catch {
              void 0;
            }
          }
        } catch {
          void 0;
        }
        if (matched >= targetInodes.size) break;
      }
      if (matched >= targetInodes.size) break;
    }
    this.logger.debug(`Built targeted fd inode map: matched=${matched}/${targetInodes.size}, pidsSeen=${pidsSeen}, fdsChecked=${fdsChecked}`);
    return map;
  }

  async _buildInodeMapViaSS(targetInodes, protocols) {
    const map = new Map();
    if (!targetInodes || targetInodes.size === 0) return map;
    const cmds = [];
    if (protocols.includes('tcp') || protocols.includes('tcp6')) {
      cmds.push(['nsenter', ['-t', '1', '-n', 'ss', '-tinp']]);
    }
    if (protocols.includes('udp') || protocols.includes('udp6')) {
      cmds.push(['nsenter', ['-t', '1', '-n', 'ss', '-uinp']]);
    }
    if (cmds.length === 0) return map;
    let matched = 0;
    for (const [cmd, args] of cmds) {
      let stdout = '';
      try {
        const res = await execAsync(`${cmd} ${args.join(' ')}`);
        stdout = res.stdout || '';
    } catch {
        try {
      const alt = args.slice(3);
          const res2 = await execAsync(`ss ${alt.join(' ')}`);
          stdout = res2.stdout || '';
        } catch {
          continue;
        }
      }
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const inoMatch = line.match(/ino:(\d+)/);
        if (!inoMatch) continue;
        const inode = parseInt(inoMatch[1], 10);
        if (!targetInodes.has(inode) || map.has(inode)) continue;
  const usersMatch = line.match(/users:\(\(([^)]+)\)\)/);
        let name = 'unknown';
        let pid = undefined;
        if (usersMatch) {
          const segment = usersMatch[1];
          const nameMatch = segment.match(/"([^"]+)"/);
          if (nameMatch) name = nameMatch[1];
          const pidMatch = segment.match(/pid=(\d+)/);
          if (pidMatch) pid = parseInt(pidMatch[1], 10);
        }
        map.set(inode, { pid, name });
        matched++;
        if (matched >= targetInodes.size) break;
      }
      if (matched >= targetInodes.size) break;
    }
    this.logger.debug(`Built ss inode map: matched=${matched}/${targetInodes.size}`);
    return map;
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
      ;
    }
    
    return null;
  }
}

module.exports = ProcParser;