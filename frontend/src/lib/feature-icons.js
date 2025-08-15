import { 
  Sparkles,
  Search,
  Globe,
  Zap,
  Container,
  Settings,
  HeartPulse,
  Sparkles as SparklesAlt,
  Shield,
  Cog,
  Users,
  FileText,
  BarChart3
} from 'lucide-react';

export const ICON_CATEGORIES = [
  {
    name: 'ui-interface',
    icon: Sparkles,
    keywords: [
      'drawer', 'panel', 'modal', 'dialog', 'sidebar', 'interface', 'ui', 
      'layout', 'design', 'visual', 'display', 'component', 'theme', 
      'responsive', 'mobile', 'desktop', 'navigation', 'menu'
    ]
  },
  {
    name: 'search-filter',
    icon: Search,
    keywords: [
      'search', 'filter', 'find', 'query', 'lookup', 'global search', 
      'scope', 'sort', 'order', 'pagination', 'highlight'
    ]
  },
  {
    name: 'network-ports',
    icon: Globe,
    keywords: [
      'port', 'network', 'connection', 'endpoint', 'internal', 'published', 
      'host', 'ip', 'tcp', 'udp', 'http', 'https', 'api', 'rest', 'websocket'
    ]
  },
  {
    name: 'performance',
    icon: Zap,
    keywords: [
      'performance', 'cache', 'speed', 'optimization', 'faster', 'efficiency', 
      'memory', 'cpu', 'loading', 'latency', 'throughput', 'benchmark'
    ]
  },
  {
    name: 'containers',
    icon: Container,
    keywords: [
      'docker', 'container', 'image', 'compose', 'kubernetes', 'k8s', 'pod', 
      'orchestration', 'microservice', 'deployment', 'registry'
    ]
  },
  {
    name: 'system-infrastructure',
    icon: Cog,
    keywords: [
      'system', 'server', 'infrastructure', 'deployment', 'setup', 'installation', 
      'configuration', 'environment', 'platform', 'operating system', 'linux', 
      'windows', 'macos', 'process', 'service'
    ]
  },
  {
    name: 'health-monitoring',
    icon: HeartPulse,
    keywords: [
      'health', 'monitoring', 'status', 'check', 'diagnostics', 'uptime', 
      'availability', 'heartbeat', 'ping', 'probe', 'metrics', 'alerts'
    ]
  },
  {
    name: 'security',
    icon: Shield,
    keywords: [
      'security', 'auth', 'authentication', 'authorization', 'secure', 'ssl', 
      'tls', 'certificate', 'encryption', 'token', 'password', 'login', 
      'access control', 'permissions', 'vulnerability'
    ]
  },
  {
    name: 'analytics-data',
    icon: BarChart3,
    keywords: [
      'analytics', 'data', 'statistics', 'metrics', 'reporting', 'dashboard', 
      'chart', 'graph', 'visualization', 'insights', 'tracking', 'telemetry'
    ]
  },
  {
    name: 'user-management',
    icon: Users,
    keywords: [
      'user', 'users', 'team', 'collaboration', 'sharing', 'permissions', 
      'roles', 'groups', 'profile', 'account', 'multi-user'
    ]
  },
  {
    name: 'documentation',
    icon: FileText,
    keywords: [
      'documentation', 'docs', 'help', 'guide', 'tutorial', 'readme', 
      'changelog', 'notes', 'comments', 'annotations', 'wiki'
    ]
  },
  {
    name: 'configuration',
    icon: Settings,
    keywords: [
      'configuration', 'settings', 'preferences', 'options', 'customization', 
      'config', 'parameters', 'variables', 'environment variables', 'flags'
    ]
  }
];

export function getFeatureIcon(feature) {
  const title = feature.title?.toLowerCase() || '';
  const description = feature.description?.toLowerCase() || '';
  
  let bestMatch = null;
  let highestScore = 0;
  
  for (const category of ICON_CATEGORIES) {
    let score = 0;
    
    const titleMatches = category.keywords.filter(keyword => 
      title.includes(keyword.toLowerCase())
    ).length;
    
    const descriptionMatches = category.keywords.filter(keyword => 
      description.includes(keyword.toLowerCase())
    ).length;
    
    score = (titleMatches * 3) + descriptionMatches;
    
    if (score > highestScore) {
      highestScore = score;
      bestMatch = category;
    }
  }
  
  return bestMatch ? bestMatch.icon : SparklesAlt;
}

export function getFeatureCategory(feature) {
  const title = feature.title?.toLowerCase() || '';
  const description = feature.description?.toLowerCase() || '';
  
  let bestMatch = null;
  let highestScore = 0;
  
  for (const category of ICON_CATEGORIES) {
    let score = 0;
    
    const titleMatches = category.keywords.filter(keyword => 
      title.includes(keyword.toLowerCase())
    ).length;
    
    const descriptionMatches = category.keywords.filter(keyword => 
      description.includes(keyword.toLowerCase())
    ).length;
    
    score = (titleMatches * 3) + descriptionMatches;
    
    if (score > highestScore) {
      highestScore = score;
      bestMatch = category;
    }
  }
  
  return bestMatch ? bestMatch.name : 'default';
}

export function addKeywordsToCategory(categoryName, newKeywords) {
  const category = ICON_CATEGORIES.find(cat => cat.name === categoryName);
  if (category) {
    category.keywords.push(...newKeywords);
  }
}
