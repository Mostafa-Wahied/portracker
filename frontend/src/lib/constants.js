export const SERVER_TYPES = {
  STANDARD: 'standard',
};

export const SERVER_STATUS = {
  ONLINE: {
    id: 'online',
    label: 'online',
    className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  },
  OFFLINE: {
    id: 'offline',
    label: 'offline',
    className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
  },
  NO_API: {
    id: 'no_api',
    label: 'no API',
    className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  }
};

export const ERROR_TYPES = {
  NETWORK: 'network_error',
  API: 'api_error'
};

export const RESTART_POLICY_STYLES = {
  'always': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'unless-stopped': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'on-failure': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'no': 'bg-slate-200 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300',
  'none': 'bg-slate-200 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300'
};

export function isEphemeralContainer(container) {
  if (!container) return false;
  if (typeof container.ephemeral === 'boolean') return container.ephemeral;
  const rp = container.restartPolicy;
  const uptime = container.uptimeSeconds;
  return (rp === 'none' || rp === 'no') && typeof uptime === 'number' && uptime < 300;
}