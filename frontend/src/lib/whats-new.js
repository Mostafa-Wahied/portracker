import Logger from './logger';

const logger = new Logger('WhatsNewUtils');

export function parseChangelog(changelogContent) {
  try {
    const versions = {};
    const lines = changelogContent.split('\n');
    let currentVersion = null;
    let currentSection = null;
    let features = { frontend: [], backend: [], development: [], infrastructure: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      const versionMatch = line.match(/^##\s*\[([^\]]+)\]/);
      if (versionMatch) {
        if (currentVersion && (features.frontend.length > 0 || features.backend.length > 0 || features.development.length > 0 || features.infrastructure.length > 0)) {
          versions[currentVersion] = { ...features };
        }
        
        currentVersion = versionMatch[1];
        currentSection = null;
        features = { frontend: [], backend: [], development: [], infrastructure: [] };
        continue;
      }

      const sectionMatch = line.match(/^###\s+(.+)$/);
      if (sectionMatch && currentVersion) {
        const sectionName = sectionMatch[1].toLowerCase();
        if (sectionName.includes('frontend')) {
          currentSection = 'frontend';
        } else if (sectionName.includes('backend')) {
          currentSection = 'backend';  
        } else if (sectionName.includes('development') || sectionName.includes('infrastructure')) {
          currentSection = 'development';
        } else if (sectionName.includes('security') || sectionName.includes('improvements')) {
          currentSection = 'development';
        } else if (sectionName.includes('initial')) {
          currentSection = 'development';
        } else {
          currentSection = 'development';
        }
        continue;
      }

      const featureMatch = line.match(/^-\s*\*\*(.+?)\*\*:\s*(.+)$/);
      if (featureMatch && currentSection) {
        const title = featureMatch[1].trim();
        const description = featureMatch[2].trim();
        
        features[currentSection].push({
          title,
          description
        });
      }
    }

    if (currentVersion && (features.frontend.length > 0 || features.backend.length > 0 || features.development.length > 0 || features.infrastructure.length > 0)) {
      versions[currentVersion] = { ...features };
    }

    logger.debug('Parsed changelog versions:', Object.keys(versions));
    return versions;
  } catch (error) {
    logger.error('Error parsing changelog:', error);
    return {};
  }
}

export function getLastSeenVersion() {
  try {
    return localStorage.getItem('portracker_last_seen_version') || null;
  } catch (error) {
    logger.warn('Failed to get last seen version:', error);
    return null;
  }
}

export function setLastSeenVersion(version) {
  try {
    localStorage.setItem('portracker_last_seen_version', version);
    logger.debug('Set last seen version:', version);
  } catch (error) {
    logger.warn('Failed to set last seen version:', error);
  }
}

export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  
  const parseVersion = (version) => {
    return version.split('.').map(num => parseInt(num, 10) || 0);
  };

  const version1 = parseVersion(v1);
  const version2 = parseVersion(v2);
  
  const maxLength = Math.max(version1.length, version2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const num1 = version1[i] || 0;
    const num2 = version2[i] || 0;
    
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }
  
  return 0;
}

export function getNewVersions(parsedVersions, lastSeenVersion) {
  logger.debug('getNewVersions called:', {
    parsedVersionsKeys: Object.keys(parsedVersions),
    lastSeenVersion,
    parsedVersions: parsedVersions
  });
  
  if (!parsedVersions || Object.keys(parsedVersions).length === 0) {
    logger.debug('getNewVersions: No parsed versions available');
    return [];
  }
  
  const availableVersions = Object.keys(parsedVersions).sort((a, b) => compareVersions(b, a));
  logger.debug('getNewVersions: Available versions sorted:', availableVersions);
  
  if (!lastSeenVersion) {
    logger.debug('getNewVersions: No last seen version, returning all versions:', availableVersions);
    return availableVersions;
  }
  
  const newVersions = availableVersions.filter(version => {
    const comparison = compareVersions(version, lastSeenVersion);
    logger.debug('getNewVersions: Comparing', version, 'vs', lastSeenVersion, '=', comparison);
    return comparison > 0;
  });
  
  logger.debug('getNewVersions: Filtered new versions:', newVersions);
  return newVersions;
}

export function combineVersionChanges(versions, versionKeys) {
  const combined = { frontend: [], backend: [], development: [] };
  
  const sortedVersions = versionKeys.sort((a, b) => compareVersions(b, a));
  
  for (const version of sortedVersions) {
    const versionChanges = versions[version];
    if (versionChanges) {
      if (versionChanges.frontend) {
        combined.frontend.push(...versionChanges.frontend);
      }
      if (versionChanges.backend) {
        combined.backend.push(...versionChanges.backend);
      }
      if (versionChanges.development) {
        combined.development.push(...versionChanges.development);
      }
      if (versionChanges.infrastructure) {
        combined.development.push(...versionChanges.infrastructure);
      }
    }
  }
  
  return combined;
}

export function groupVersionChanges(versions, versionKeys) {
  const sortedVersions = versionKeys.sort((a, b) => compareVersions(b, a));
  
  return sortedVersions.map(version => {
    const versionChanges = versions[version];
    const changes = { frontend: [], backend: [], development: [] };
    
    if (versionChanges) {
      if (versionChanges.frontend) {
        changes.frontend.push(...versionChanges.frontend);
      }
      if (versionChanges.backend) {
        changes.backend.push(...versionChanges.backend);
      }
      if (versionChanges.development) {
        changes.development.push(...versionChanges.development);
      }
      if (versionChanges.infrastructure) {
        changes.development.push(...versionChanges.infrastructure);
      }
    }
    
    return {
      version,
      changes
    };
  }).filter(item => 
    item.changes.frontend.length > 0 || 
    item.changes.backend.length > 0 || 
    item.changes.development.length > 0
  );
}

export function shouldShowWhatsNew(currentVersion) {
  if (!currentVersion) {
    logger.debug('shouldShowWhatsNew: No current version provided');
    return false;
  }
  
  const lastSeenVersion = localStorage.getItem('portracker_last_seen_version');
  
  if (!lastSeenVersion) {
    logger.debug('shouldShowWhatsNew: No last seen version, first time user');
    return true;
  }
  
  const comparison = compareVersions(currentVersion, lastSeenVersion);
  logger.debug('shouldShowWhatsNew: Version comparison:', {
    currentVersion,
    lastSeenVersion,
    comparison,
    shouldShow: comparison > 0
  });
  
  return comparison > 0;
}
