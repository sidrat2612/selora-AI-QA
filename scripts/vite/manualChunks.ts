function includesPackage(id: string, packageName: string): boolean {
  return id.includes(`/node_modules/${packageName}/`);
}

export function createManualChunks(id: string): string | undefined {
  if (!id.includes('/node_modules/')) {
    return undefined;
  }

  if (
    includesPackage(id, 'react') ||
    includesPackage(id, 'react-dom') ||
    includesPackage(id, 'react-router') ||
    includesPackage(id, 'scheduler')
  ) {
    return 'vendor-react';
  }

  if (id.includes('/node_modules/@tanstack/')) {
    return 'vendor-query';
  }

  if (
    includesPackage(id, 'recharts') ||
    /\/node_modules\/d3-[^/]+\//.test(id) ||
    includesPackage(id, 'internmap')
  ) {
    return 'vendor-charts';
  }

  if (
    includesPackage(id, 'react-dnd') ||
    includesPackage(id, 'react-dnd-html5-backend') ||
    includesPackage(id, 'dnd-core') ||
    includesPackage(id, '@react-dnd')
  ) {
    return 'vendor-dnd';
  }

  if (includesPackage(id, 'motion') || includesPackage(id, 'framer-motion')) {
    return 'vendor-motion';
  }

  if (includesPackage(id, 'lucide-react')) {
    return 'vendor-icons';
  }

  return 'vendor';
}