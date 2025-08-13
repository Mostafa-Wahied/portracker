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

const collectorInstances = new Map();
const collectorInitState = new Map();

/**
 * Create an appropriate collector for the given platform type
 * @param {string} platform Platform identifier
 * @param {Object} config Configuration for the collector
 * @returns {BaseCollector} A collector instance
 */
function createCollector(platform = "base", config = {}) {
  const key = platform || "base";
  if (collectorInstances.has(key)) return collectorInstances.get(key);
  const CollectorClass = collectors[key] || BaseCollector;
  const instance = new CollectorClass(config);
  collectorInstances.set(key, instance);
  if (typeof instance.initialize === 'function') {
    try {
      const p = Promise.resolve(instance.initialize()).catch(()=>{});
      collectorInitState.set(key, p);
    } catch { void 0; }
  }
  return instance;
}

async function getCollectorAsync(platform = "base", config = {}) {
  const inst = createCollector(platform, config);
  const key = platform || "base";
  const initPromise = collectorInitState.get(key);
  if (initPromise) {
    try { await initPromise; } catch { void 0; }
  }
  return inst;
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
    let tempInstance;
    try { tempInstance = new (collectors[type])( { debug } ); } catch { continue; }
    logger.debug(`Attempting compatibility check for ${type}...`);
    try {
      const score = await tempInstance.isCompatible();
      detectionDetails[type] = score;
      if (debug) logger.debug(`Compatibility score for ${type}: ${score}`);
      if (score > highestScore) {
        highestScore = score;
        bestCollector = type;
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
    const instance = createCollector(bestCollector, { debug });
    logger.info(`Auto-detected ${bestCollector} collector with score ${highestScore}`);
    logger.debug("--- detectCollector END (returning bestCollector) ---");
    return instance;
  }
  const fallback = createCollector("system", { debug });
  logger.info("No compatible collector detected with score > 0, using system collector");
  logger.debug("--- detectCollector END (returning system fallback) ---");
  return fallback;
}

/**
 * Register a new collector type
 * @param {string} platform Platform identifier
 * @param {Class} CollectorClass Collector class
 */
function registerCollector(platform, CollectorClass) {
  collectors[platform] = CollectorClass;
}

function resetCollectors() {
  collectorInstances.clear();
  collectorInitState.clear();
}

module.exports = {
  BaseCollector,
  createCollector,
  getCollectorAsync,
  detectCollector,
  registerCollector,
  collectors,
  resetCollectors,
};
