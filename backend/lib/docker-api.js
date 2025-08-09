const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');

class DockerAPIClient {
  constructor(options = {}) {
    this.logger = new Logger('DockerAPI');
    this.docker = this._initializeDocker(options);
    this.isConnected = false;
    this.deploymentPattern = null;
  }

  _initializeDocker(options) {
    const dockerHost = options.dockerHost ?? process.env.DOCKER_HOST;
    const defaultSocket = options.socketPath ?? process.env.DOCKER_SOCK ?? '/var/run/docker.sock';
    const tlsVerify = options.tlsVerify ?? (process.env.DOCKER_TLS_VERIFY === '1');
    const certPath = options.certPath ?? process.env.DOCKER_CERT_PATH;

    // 1) Unix domain socket (default and unix://)
    if (!dockerHost || dockerHost.startsWith('unix://')) {
      this.deploymentPattern = 'socket';
      const socketPath = dockerHost?.replace(/^unix:\/\//, '') || defaultSocket;
      return new Docker({ socketPath });
    }

    // 2) Windows named pipe
    if (dockerHost.startsWith('npipe://')) {
      this.deploymentPattern = 'npipe';
      return new Docker({ socketPath: dockerHost });
    }

    // 3) TCP/HTTP(S)
    const urlStr = dockerHost.replace(/^tcp:\/\//, 'http://');
    const u = new URL(urlStr);
    const dockerOpts = {
      host: u.hostname,
      port: u.port ? Number(u.port) : (tlsVerify ? 2376 : 2375),
      protocol: (u.protocol || 'http:').slice(0, -1) // 'http' | 'https'
    };

    if (tlsVerify && certPath) {
      try {
        dockerOpts.protocol = 'https';
        dockerOpts.ca = fs.readFileSync(path.join(certPath, 'ca.pem'));
        dockerOpts.cert = fs.readFileSync(path.join(certPath, 'cert.pem'));
        dockerOpts.key = fs.readFileSync(path.join(certPath, 'key.pem'));
      } catch (certError) {
        this.logger.warn('Failed to load TLS certificates, falling back to HTTP:', certError.message);
        dockerOpts.protocol = 'http';
      }
    }

    this.deploymentPattern = 'proxy';
    return new Docker(dockerOpts);
  }

  async connect() {
    try {
      this.logger.debug(`Attempting Docker API connection (${this.deploymentPattern})`);
      await this.docker.ping();
      this.isConnected = true;
      this.logger.info(`Docker API connected successfully (${this.deploymentPattern})`);
      return true;
    } catch (error) {
    this.logger.error(`Docker API connection failed (${this.deploymentPattern})`, { err: error });
      this.isConnected = false;
      return false;
    }
  }

  async _ensureConnected() {
    if (!this.isConnected) {
      this.logger.debug('Docker API not connected, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        this.logger.error('Failed to establish Docker API connection in _ensureConnected');
        throw new Error('Docker API connection failed');
      }
    }
  }

  async listContainers(options = {}) {
    await this._ensureConnected();

    try {
      const containers = await this.docker.listContainers({
        all: options.all || false,
        filters: options.filters || {}
      });

      return containers.map(container => ({
        ID: container.Id.substring(0, 12),
        Names: container.Names.map(name => name.replace(/^\//, '')).join(','),
        Image: container.Image,
        Command: container.Command,
        Created: container.Created,
        Status: container.Status,
        State: container.State,
        Ports: this._formatPorts(container.Ports),
        // Include other container properties but don't override our processed fields
        Labels: container.Labels,
        NetworkSettings: container.NetworkSettings,
        Mounts: container.Mounts,
        HostConfig: container.HostConfig
      }));
    } catch (error) {
      this.logger.error('listContainers failed:', error.message);
      throw error;
    }
  }

  async inspectContainer(containerId) {
    await this._ensureConnected();

    try {
      const container = this.docker.getContainer(containerId);
      return await container.inspect();
    } catch (error) {
      this.logger.error(`inspectContainer failed for ${containerId}:`, error.message);
      throw error;
    }
  }

  async getContainerHealth(containerId) {
    try {
      const inspection = await this.inspectContainer(containerId);
      
      return {
        status: inspection.State.Status,
        health: inspection.State.Health?.Status || 'none',
        startedAt: inspection.State.StartedAt,
        finishedAt: inspection.State.FinishedAt,
        restartCount: inspection.RestartCount,
        pid: inspection.State.Pid
      };
    } catch (error) {
      this.logger.warn(`getContainerHealth failed for ${containerId}:`, error.message);
      return {
        status: 'unknown',
        health: 'unknown',
        startedAt: null,
        finishedAt: null,
        restartCount: 0,
        pid: null
      };
    }
  }

  async getContainerProcesses(containerId) {
    await this._ensureConnected();

    try {
      const container = this.docker.getContainer(containerId);
      const { Processes, Titles } = await container.top({ ps_args: '-o pid' });
      const pidIndex = Titles.findIndex(t => t.toLowerCase() === 'pid');
      if (pidIndex === -1) {
        return [];
      }
      return Processes
        .map(row => parseInt(row[pidIndex], 10))
        .filter(Number.isInteger);
    } catch (error) {
      this.logger.warn(`getContainerProcesses failed for ${containerId}:`, error.message);
      return [];
    }
  }

  _formatPorts(ports) {
    if (!ports || ports.length === 0) return '';
    
    return ports.map(port => {
      if (port.PublicPort) {
        return `${port.IP || '0.0.0.0'}:${port.PublicPort}->${port.PrivatePort}/${port.Type}`;
      } else {
        return `${port.PrivatePort}/${port.Type}`;
      }
    }).join(', ');
  }

  async isAvailable() {
    return await this.connect();
  }

  // Additional utility methods for common operations
  async getSystemVersion() {
    await this._ensureConnected();
    
    try {
      const versionInfo = await this.docker.version();
      return {
        version: versionInfo.Version || 'unknown',
        apiVersion: versionInfo.ApiVersion || 'unknown',
        minApiVersion: versionInfo.MinAPIVersion || 'unknown',
        gitCommit: versionInfo.GitCommit || 'unknown',
        goVersion: versionInfo.GoVersion || 'unknown',
        os: versionInfo.Os || 'unknown',
        arch: versionInfo.Arch || 'unknown'
      };
    } catch (error) {
    this.logger.error('getSystemVersion failed', { err: error });
      throw error;
    }
  }

  async getSystemInfo() {
    await this._ensureConnected();
    
    try {
      return await this.docker.info();
    } catch (error) {
      this.logger.error('getSystemInfo failed:', error.message);
      throw error;
    }
  }
}

module.exports = DockerAPIClient;