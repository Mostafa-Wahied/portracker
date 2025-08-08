/**
 * PORTS TRACKER - COLLECTOR REGISTRY
 *
 * This module manages all available collectors and provides
 * a factory method to create the appropriate collector for a platform.
 */

const { Logger } = require("../lib/logger");
const BaseCollector = require("./base_collector");
const TrueNASCollector = require("./truenas_collector");
const DockerCollector = require("./docker_collector");
const SystemCollector = require("./system_collector");

const collectors = {
  base: BaseCollector,
  truenas: TrueNASCollector,
  docker: DockerCollector,
  system: SystemCollector,
};

/**
 * Create an appropriate collector for the given platform type
 * @param {string} platform Platform identifier
 * @param {Object} config Configuration for the collector
 * @returns {BaseCollector} A collector instance
 */
function createCollector(platform = "base", config = {}) {
  const CollectorClass = collectors[platform] || BaseCollector;
  return new CollectorClass(config);
}

/**
 * Asynchronously selects and returns the most compatible collector for the current system.
 * 
 * Evaluates available collector types by their compatibility scores and returns the collector with the highest positive score. If no compatible collector is found, returns a system collector as a fallback.
 * 
 * @param {Object} config - Optional configuration settings, such as debug mode.
 * @returns {Promise<BaseCollector>} A promise that resolves to the most suitable collector instance for the system.
 */
async function detectCollector(config = {}) {
  const debug = config.debug || false;
  const logger = new Logger("Collector", { debug });

  if (debug) {
    logger.debug("--- detectCollector START ---");
    logger.debug("Collector detection config:", config);
  }

  const collectorTypes = ["truenas", "docker", "system"];
  let bestCollector = null;
  let highestScore = -1;
  let detectionDetails = {};

  for (const type of collectorTypes) {
    if (!collectors[type]) continue;

    const collector = createCollector(type, { debug });
    logger.debug(`Attempting compatibility check for ${type}...`);

    try {
      const score = await collector.isCompatible();
      detectionDetails[type] = score;

      if (debug) {
        logger.debug(`Compatibility score for ${type}: ${score}`);
      }

      if (score > highestScore) {
        highestScore = score;
        bestCollector = collector;
        logger.debug(
          `New best collector: ${type} (score: ${score}, previous best: ${highestScore})`
        );
      }
    } catch (err) {
      logger.warn(`Error checking compatibility for ${type}:`, err.message);
      detectionDetails[type] = 0;
    }
  }

  if (debug) {
    logger.debug(`Final detection scores:`, detectionDetails);
  }

  if (bestCollector && highestScore > 0) {
    const message = `Auto-detected ${bestCollector.platform} collector with score ${highestScore}`;
    logger.info(message);
    logger.debug("--- detectCollector END (returning bestCollector) ---");
    return bestCollector;
  }

  const systemCollector = createCollector("system", { debug });
  logger.info(
    "No compatible collector detected with score > 0, using system collector"
  );
  logger.debug("--- detectCollector END (returning system fallback) ---");
  return systemCollector;
}

/**
 * Register a new collector type
 * @param {string} platform Platform identifier
 * @param {Class} CollectorClass Collector class
 */
function registerCollector(platform, CollectorClass) {
  collectors[platform] = CollectorClass;
}

module.exports = {
  BaseCollector,
  createCollector,
  detectCollector,
  registerCollector,
  collectors,
};
