export interface ToolEntry {
  slug: string;       // 'compress-image'
  href: string;       // '/compress-image'
  name: string;       // 'Compress Image' — card title / anchor text
  shortName: string;  // 'Compress' — header menu label
  icon: string;       // emoji glyph
  blurb: string;      // one-line description for cards
}

export const TOOL_REGISTRY: ToolEntry[] = [
  { slug: 'compress-image', href: '/compress-image', name: 'Compress Image', shortName: 'Compress', icon: '🗜', blurb: 'Shrink JPG, PNG, WebP & HEIC file sizes.' },
  { slug: 'heic-to-jpg', href: '/heic-to-jpg', name: 'HEIC to JPG', shortName: 'HEIC→JPG', icon: '🖼', blurb: 'Convert iPhone HEIC photos to JPG.' },
  { slug: 'heic-to-png', href: '/heic-to-png', name: 'HEIC to PNG', shortName: 'HEIC→PNG', icon: '🎨', blurb: 'Convert HEIC to lossless PNG.' },
  { slug: 'heic-to-pdf', href: '/heic-to-pdf', name: 'HEIC to PDF', shortName: 'HEIC→PDF', icon: '📄', blurb: 'Turn HEIC photos into PDF documents.' },
];

export function relatedTools(currentSlug: string): ToolEntry[] {
  return TOOL_REGISTRY.filter((t) => t.slug !== currentSlug);
}
