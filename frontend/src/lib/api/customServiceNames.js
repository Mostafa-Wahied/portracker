/**
 * API client for custom service name operations
 * Handles CRUD operations for renaming service names with database persistence
 */

/**
 * Saves a custom service name for a specific port
 * @param {string} serverId - The server ID
 * @param {string} hostIp - The host IP address
 * @param {number} hostPort - The host port number
 * @param {string} customName - The custom service name
 * @param {string} originalName - The original service name (for reset functionality)
 * @param {string} serverUrl - Optional server URL for peer servers
 * @param {string} containerId - Optional container ID for internal ports
 * @returns {Promise<Object>} Response from the API
 */
export async function saveCustomServiceName(serverId, hostIp, hostPort, customName, originalName, serverUrl = null, containerId = null) {
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
    custom_name: customName,
    original_name: originalName,
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
 * @param {string} serverUrl - Optional server URL for peer servers
 * @param {string} containerId - Optional container ID for internal ports
 * @returns {Promise<Object>} Response from the API
 */
export async function deleteCustomServiceName(serverId, hostIp, hostPort, serverUrl = null, containerId = null) {
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
  };
  
  if (containerId) {
    body.container_id = containerId;
  }

  const response = await fetch(targetUrl, {
    method: "DELETE",
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