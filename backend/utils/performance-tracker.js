/**
 * Simple performance tracking utility for measuring operation durations
 */
const { Logger } = require('../lib/logger');

class PerformanceTracker {
  constructor() {
    this.operations = new Map();
    this.logger = new Logger("Performance", { debug: process.env.DEBUG === 'true' });
  }

  /**
   * Start timing an operation
   * @param {string} operation Operation name
   */
  start(operation) {
    this.operations.set(operation, { startTime: Date.now() });
  }

  /**
   * End timing an operation and return duration
   * @param {string} operation Operation name
   * @returns {number} Duration in milliseconds
   */
  end(operation) {
    const op = this.operations.get(operation);
    if (!op) {
      this.logger.warn(
        `Warning: No start time found for operation '${operation}'`
      );
      return 0;
    }

    const duration = Date.now() - op.startTime;
    op.duration = duration;
    this.logger.debug(`${operation}: ${duration}ms`);
    return duration;
  }

  /**
   * Get summary of all measured operations
   * @returns {Array} Array of operation summaries
   */
  getSummary() {
    return Array.from(this.operations.entries())
      .map(([operation, data]) => ({
        operation,
        duration: data.duration || 0,
      }))
      .sort((a, b) => b.duration - a.duration);
  }

  /**
   * Reset all measurements
   */
  reset() {
    this.operations.clear();
  }
}

module.exports = PerformanceTracker;
