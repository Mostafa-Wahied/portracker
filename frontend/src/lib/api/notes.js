/**
 * API client for notes operations
 * Handles CRUD operations for port notes with database persistence
 */

/**
 * Saves a note for a specific port
 * @param {string} serverId - The server ID
 * @param {string} hostIp - The host IP address
 * @param {number} hostPort - The host port number
 * @param {string} protocol - The protocol (tcp or udp)
 * @param {string} note - The note content
 * @param {string} serverUrl - Optional server URL for peer servers
 * @param {string} containerId - Optional container ID for internal ports
 * @param {boolean} internal - Whether this is an internal port
 * @returns {Promise<Object>} Response from the API
 */
export async function saveNote(serverId, hostIp, hostPort, protocol, note, serverUrl = null, containerId = null, internal = false) {
  let targetUrl = "/api/notes";
  let requestServerId = serverId;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/notes`;
    requestServerId = "local";
  }

  const body = {
    server_id: requestServerId,
    host_ip: hostIp,
    host_port: hostPort,
    protocol: protocol,
    note: note,
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
 * Performs batch operations on notes
 * @param {string} serverId - The server ID
 * @param {Array} operations - Array of operations {action: "set"|"delete", host_ip, host_port, note?, container_id?}
 * @param {string} serverUrl - Optional server URL for peer servers
 * @returns {Promise<Object>} Response from the API
 */
export async function batchNotes(serverId, operations, serverUrl = null) {
  let targetUrl = "/api/notes/batch";
  let requestServerId = serverId;

  if (serverId !== "local" && serverUrl) {
    targetUrl = `${serverUrl.replace(/\/+$/, "")}/api/notes/batch`;
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