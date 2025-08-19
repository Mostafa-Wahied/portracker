/**
 * Utility functions for port-related operations
 */

/**
 * Generates a unique key for a port selection
 * @param {string} serverId - The server ID
 * @param {Object} port - The port object
 * @returns {string} Unique port key
 */
export function generatePortKey(serverId, port) {
  const internalSuffix = port.internal ? '-internal' : '';
  return `${serverId}-${port.host_ip}-${port.host_port}-${port.container_id || ''}${internalSuffix}`;
}

/**
 * Generates display key for port (used for itemKey props)
 * @param {string} serverId - The server ID  
 * @param {Object} port - The port object
 * @returns {string} Display key
 */
export function generatePortDisplayKey(serverId, port) {
  return port.internal
    ? `${serverId}-${port.container_id || port.app_id}-${port.host_port}-internal`
    : `${serverId}-${port.host_ip}-${port.host_port}`;
}