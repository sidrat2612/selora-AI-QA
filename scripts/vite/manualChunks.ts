const CHART_PACKAGES = new Set([
  'recharts',
  'victory-vendor',
  'internmap',
]);

const DND_PACKAGES = new Set([
  'react-dnd',
  'react-dnd-html5-backend',
  'dnd-core',
]);

function getPackageName(id: string): string | null {
  const marker = '/node_modules/';
  const lastNodeModulesIndex = id.lastIndexOf(marker);

  if (lastNodeModulesIndex === -1) {
    return null;
  }

  const packagePath = id.slice(lastNodeModulesIndex + marker.length);
  const segments = packagePath.split('/');

  if (segments.length === 0) {
    return null;
  }

  const [firstSegment, secondSegment] = segments;
  if (!firstSegment) {
    return null;
  }

  if (firstSegment.startsWith('@') && secondSegment) {
    return `${firstSegment}/${secondSegment}`;
  }

  return firstSegment;
}

function isD3Package(packageName: string): boolean {
  return packageName.startsWith('d3-');
}

export function createManualChunks(id: string): string | undefined {
  const packageName = getPackageName(id);

  if (!packageName) {
    return undefined;
  }

  if (
    packageName === 'react' ||
    packageName === 'react-dom' ||
    packageName === 'react-router' ||
    packageName === 'scheduler'
  ) {
    return 'vendor-react';
  }

  if (packageName.startsWith('@tanstack/')) {
    return 'vendor-query';
  }

  if (CHART_PACKAGES.has(packageName) || isD3Package(packageName)) {
    return 'vendor-charts';
  }

  if (DND_PACKAGES.has(packageName) || packageName.startsWith('@react-dnd/')) {
    return 'vendor-dnd';
  }

  if (packageName === 'motion' || packageName === 'framer-motion') {
    return 'vendor-motion';
  }

  if (packageName === 'lucide-react') {
    return 'vendor-icons';
  }

  return 'vendor';
}