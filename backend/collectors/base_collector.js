/**
 * PORTS TRACKER - BASE COLLECTOR
 *
 * This is the foundation for all platform-specific collectors.
 * Each collector is responsible for gathering system information,
 * applications, ports, and virtual machines from a specific platform.
 */

const { Logger } = require("../lib/logger");

class BaseCollector {
  /**
   * Create a new collector instance
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    this.config = config;
    this.debug = config.debug || false;
    this.platform = "generic";
    this.platformName = "Generic Platform";
    
    // Initialize logger for this collector
    this.logger = new Logger(this.platformName, { debug: this.debug });
  }

  /**
   * Get basic system information
   * @returns {Promise<Object>} System information
   */
  async getSystemInfo() {
    throw new Error("Method not implemented: getSystemInfo()");
  }

  /**
   * Get list of running applications/containers
   * @returns {Promise<Array>} List of applications
   */
  async getApplications() {
    throw new Error("Method not implemented: getApplications()");
  }

  /**
   * Get list of open ports
   * @returns {Promise<Array>} List of port entries
   */
  async getPorts() {
    throw new Error("Method not implemented: getPorts()");
  }

  /**
   * Get list of virtual machines
   * @returns {Promise<Array>} List of VMs
   */
  async getVMs() {
    throw new Error("Method not implemented: getVMs()");
  }

  /**
   * Get all data from this collector
   * @returns {Promise<Object>} All collected data
   */
  async collectAll() {
    if (
      this.collect &&
      typeof this.collect === "function" &&
      this.collect !== BaseCollector.prototype.collect
    ) {
      return await this.collect();
    }

    // Otherwise use the standard approach
    try {
      const [systemInfo, applications, ports, vms] = await Promise.allSettled([
        this.getSystemInfo(),
        this.getApplications(),
        this.getPorts(),
        this.getVMs(),
      ]);

      return {
        platform: this.platform,
        platformName: this.platformName,
        systemInfo: systemInfo.status === "fulfilled" ? systemInfo.value : null,
        applications:
          applications.status === "fulfilled" ? applications.value : [],
        ports: ports.status === "fulfilled" ? ports.value : [],
        vms: vms.status === "fulfilled" ? vms.value : [],
        timestamp: new Date().toISOString(),
        errors: {
          systemInfo:
            systemInfo.status === "rejected" ? systemInfo.reason.message : null,
          applications:
            applications.status === "rejected"
              ? applications.reason.message
              : null,
          ports: ports.status === "rejected" ? ports.reason.message : null,
          vms: vms.status === "rejected" ? vms.reason.message : null,
        },
      };
    } catch (error) {
      this.logger.error(`Error collecting all data: ${error.message}`);
      return {
        platform: this.platform,
        platformName: this.platformName,
        systemInfo: null,
        applications: [],
        ports: [],
        vms: [],
        timestamp: new Date().toISOString(),
        errors: {
          general: error.message,
        },
      };
    }
  }

  /**
   * Store detection information for API access
   * @param {Object} info Detection information
   */
  setDetectionInfo(info) {
    this.detectionInfo = info;
  }

  /**
   * Check compatibility (to be implemented by subclasses)
   * @returns {Promise<number>} Confidence score 0-100
   */
  async isCompatible() {
    return 0;
  }

  /**
   * Normalize a port entry to ensure consistent format
   * @param {Object} entry Raw port entry
   * @returns {Object} Normalized port entry
   */
  normalizePortEntry(entry) {
    return {
      source: entry.source || this.platform,
      owner: entry.owner || "unknown",
      protocol: entry.protocol || "tcp",
      host_ip: entry.host_ip || "0.0.0.0",
      host_port: parseInt(entry.host_port, 10) || 0,
      target: entry.target || null,
      container_id: entry.container_id || null,
      vm_id: entry.vm_id || null,
      app_id: entry.app_id || null,
      created: entry.created || null,
      internal: entry.internal || false,
    };
  }

  /**
   * Info logging helper - always shows important operational information
   * @param {...any} args Arguments to log
   */
  logInfo(...args) {
    this.logger.info(...args);
  }

  /**
   * Debug logging helper - only shows when debug=true
   * @param {...any} args Arguments to log
   */
  log(...args) {
    this.logger.debug(...args);
  }

  /**
   * Error logging helper - always shows errors
   * @param {...any} args Arguments to log
   */
  logError(...args) {
    this.logger.error(...args);
  }

  /**
   * Warning logging helper - always shows warnings
   * @param {...any} args Arguments to log
   */
  logWarn(...args) {
    this.logger.warn(...args);
  }
}

module.exports = BaseCollector;
