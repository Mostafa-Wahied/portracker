const Docker = require('dockerode');
const { Logger } = require('./logger');

class DockerAPIClient {
  constructor(options = {}) {
    this.logger = new Logger('DockerAPI');
    this.docker = this._initializeDocker(options);
    this.isConnected = false;
    this.deploymentPattern = null;
  }

  _initializeDocker(options) {
    const dockerHost = options.dockerHost || process.env.DOCKER_HOST;
    const socketPath = options.socketPath || '/var/run/docker.sock';

    if (dockerHost) {
      this.deploymentPattern = 'proxy';
      return new Docker({ host: dockerHost.replace('tcp://', 'http://') });
    } else {
      this.deploymentPattern = 'socket';
      return new Docker({ socketPath });
    }
  }

  async connect() {
    try {
      this.logger.debug(`Attempting Docker API connection (${this.deploymentPattern})`);
      await this.docker.ping();
      this.isConnected = true;
      this.logger.info(`Docker API connected successfully (${this.deploymentPattern})`);
      return true;
    } catch (error) {
      this.logger.error(`Docker API connection failed (${this.deploymentPattern}):`, error.message);
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
      const processInfo = await container.top({ ps_args: '-o pid' });
      
      return processInfo.Processes
        .slice(1)
        .map(process => parseInt(process[0], 10))
        .filter(pid => !isNaN(pid));
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
        client: versionInfo.Client?.Version || 'unknown',
        server: versionInfo.Version || 'unknown',
        apiVersion: versionInfo.ApiVersion || 'unknown'
      };
    } catch (error) {
      this.logger.error('getSystemVersion failed:', error.message);
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