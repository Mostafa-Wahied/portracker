const { execSync } = require('child_process');
const { Logger } = require('./logger');
const DockerAPIClient = require('./docker-api');

class DockerWrapper {
  constructor(options = {}) {
    this.logger = new Logger('DockerWrapper');
    this.apiClient = new DockerAPIClient(options);
    this.useAPI = options.preferAPI !== false;
    this.apiConnected = false;
  }

  async initialize() {
    if (this.useAPI) {
      try {
        this.apiConnected = await this.apiClient.connect();
        if (this.apiConnected) {
          this.logger.info(`Docker API connected (${this.apiClient.deploymentPattern} pattern)`);
          return true;
        }
      } catch (error) {
        this.logger.warn('Docker API initialization failed, will use CLI fallback:', error.message);
      }
    }
    
    this.logger.info('Using Docker CLI commands');
    return this._testCLI();
  }

  _testCLI() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      this.logger.error('Docker CLI not available:', error.message);
      return false;
    }
  }

  async listContainers(all = false) {
    if (this.apiConnected) {
      return await this.apiClient.listContainers({ all });
    }

    try {
      const args = all ? '-a' : '';
      const format = '--format "table {{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Command}}\\t{{.CreatedAt}}\\t{{.Status}}\\t{{.State}}\\t{{.Ports}}"';
      const cmd = `docker ps ${args} ${format}`;
      
      const output = execSync(cmd, { encoding: 'utf8' });
      return this._parseCLIOutput(output);
    } catch (error) {
      this.logger.error('CLI listContainers failed:', error.message);
      throw error;
    }
  }

  async inspectContainer(containerId) {
    if (this.apiConnected) {
      return await this.apiClient.inspectContainer(containerId);
    }

    try {
      const cmd = `docker inspect ${containerId}`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return JSON.parse(output)[0];
    } catch (error) {
      this.logger.error(`CLI inspectContainer failed for ${containerId}:`, error.message);
      throw error;
    }
  }

  async getContainerHealth(containerId) {
    if (this.apiConnected) {
      return await this.apiClient.getContainerHealth(containerId);
    }

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
      this.logger.warn(`CLI getContainerHealth failed for ${containerId}:`, error.message);
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
    if (this.apiConnected) {
      return await this.apiClient.getContainerProcesses(containerId);
    }

    try {
      const cmd = `docker top ${containerId} -o pid`;
      const output = execSync(cmd, { encoding: 'utf8' });
      
      return output.split('\n')
        .slice(1)
        .map(line => line.trim())
        .filter(line => line)
        .map(pid => parseInt(pid, 10))
        .filter(pid => !isNaN(pid));
    } catch (error) {
      this.logger.warn(`CLI getContainerProcesses failed for ${containerId}:`, error.message);
      return [];
    }
  }

  _parseCLIOutput(output) {
    const lines = output.split('\n').filter(line => line && !line.startsWith('CONTAINER ID'));
    
    return lines.map(line => {
      const parts = line.split('\t');
      if (parts.length < 8) return null;

      return {
        ID: parts[0].trim(),
        Names: parts[1].trim(),
        Image: parts[2].trim(),
        Command: parts[3].trim(),
        Created: parts[4].trim(),
        Status: parts[5].trim(),
        State: parts[6].trim(),
        Ports: parts[7].trim()
      };
    }).filter(container => container !== null);
  }

  async isAvailable() {
    if (this.useAPI) {
      return await this.apiClient.isAvailable();
    }
    return this._testCLI();
  }

  // Legacy CLI-compatible methods for backwards compatibility
  async version() {
    try {
      const cmd = 'docker version';
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    } catch (error) {
      this.logger.error('Docker version command failed:', error.message);
      throw error;
    }
  }

  async info() {
    try {
      const cmd = 'docker info';
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    } catch (error) {
      this.logger.error('Docker info command failed:', error.message);
      throw error;
    }
  }

  async ps(args = []) {
    try {
      const argsStr = Array.isArray(args) ? args.join(' ') : args;
      const cmd = `docker ps ${argsStr}`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    } catch (error) {
      this.logger.error('Docker ps command failed:', error.message);
      throw error;
    }
  }

  async inspect(containerId, format = '') {
    try {
      const formatStr = format ? `--format ${format}` : '';
      const cmd = `docker inspect ${formatStr} ${containerId}`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    } catch (error) {
      this.logger.error(`Docker inspect command failed for ${containerId}:`, error.message);
      throw error;
    }
  }

  async top(containerId, options = '') {
    try {
      const optionsStr = Array.isArray(options) ? options.join(' ') : options;
      const cmd = `docker top ${containerId} ${optionsStr}`;
      const output = execSync(cmd, { encoding: 'utf8' });
      return output;
    } catch (error) {
      this.logger.error(`Docker top command failed for ${containerId}:`, error.message);
      throw error;
    }
  }
}

module.exports = DockerWrapper;
