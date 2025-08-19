/**
 * API client for custom service name operations
 * Handles CRUD operations for renaming service names with database persistence
 */

/**
 * Saves a custom service name for a specific port
 * @param {string} serverId - The server ID
 * @param {string} hostIp - The host IP address
 * @param {number} hostPort - The host port number
 * @param {string} protocol - The protocol (tcp or udp)
 * @param {string} customName - The custom service name
 * @param {string} originalName - The original service name (for reset functionality)
 * @param {string} serverUrl - Optional server URL for peer servers
 * @param {string} containerId - Optional container ID for internal ports
 * @param {boolean} internal - Whether this is an internal port
 * @returns {Promise<Object>} Response from the API
 */
export async function saveCustomServiceName(serverId, hostIp, hostPort, protocol, customName, originalName, serverUrl = null, containerId = null, internal = false) {
  let targetUrl = "/api/custom-service-names";
  let requestServerId = serverId;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/custom-service-names`;
    requestServerId = "local";
  }

  const body = {
    server_id: requestServerId,
    host_ip: hostIp,
    host_port: hostPort,
    protocol: protocol,
    custom_name: customName,
    original_name: originalName,
    internal: internal,
  };
  
  if (containerId) {
    body.container_id = containerId;
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Deletes a custom service name for a specific port (resets to original)
 * @param {string} serverId - The server ID
 * @param {string} hostIp - The host IP address
 * @param {number} hostPort - The host port number
 * @param {string} protocol - The protocol (tcp or udp)
 * @param {string} serverUrl - Optional server URL for peer servers
 * @param {string} containerId - Optional container ID for internal ports
 * @param {boolean} internal - Whether this is an internal port
 * @returns {Promise<Object>} Response from the API
 */
export async function deleteCustomServiceName(serverId, hostIp, hostPort, protocol, serverUrl = null, containerId = null, internal = false) {
  let targetUrl = "/api/custom-service-names";
  let requestServerId = serverId;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/custom-service-names`;
    requestServerId = "local";
  }

  const body = {
    server_id: requestServerId,
    host_ip: hostIp,
    host_port: hostPort,
    protocol: protocol,
    internal: internal,
  };
  
  if (containerId) {
    body.container_id = containerId;
  }

  const response = await fetch(targetUrl, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 404) {
    return { success: true, message: "Custom service name already deleted or did not exist" };
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Retrieves all custom service names for a server
 * @param {string} serverId - The server ID
 * @param {string} serverUrl - Optional server URL for peer servers
 * @returns {Promise<Array>} Array of custom service names
 */
export async function getCustomServiceNames(serverId, serverUrl = null) {
  let targetUrl = `/api/custom-service-names?server_id=${serverId}`;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/custom-service-names?server_id=local`;
  }

  const response = await fetch(targetUrl);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Performs batch operations on custom service names
 * @param {string} serverId - The server ID
 * @param {Array} operations - Array of operations {action: "set"|"delete", host_ip, host_port, custom_name?, original_name?}
 * @param {string} serverUrl - Optional server URL for peer servers
 * @returns {Promise<Object>} Response from the API
 */
export async function batchCustomServiceNames(serverId, operations, serverUrl = null) {
  let targetUrl = "/api/custom-service-names/batch";
  let requestServerId = serverId;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/custom-service-names/batch`;
    requestServerId = "local";
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server_id: requestServerId,
      operations: operations,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}