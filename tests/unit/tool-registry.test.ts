import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, relatedTools } from '../../src/content/tool-registry';

describe('tool registry', () => {
  it('has no duplicate slugs', () => {
    const slugs = TOOL_REGISTRY.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('includes the compressor and the three converters', () => {
    const slugs = TOOL_REGISTRY.map((t) => t.slug);
    expect(slugs).toContain('compress-image');
    expect(slugs).toContain('heic-to-jpg');
    expect(slugs).toContain('heic-to-png');
    expect(slugs).toContain('heic-to-pdf');
  });
  it('relatedTools excludes the current slug', () => {
    const related = relatedTools('compress-image');
    expect(related.find((t) => t.slug === 'compress-image')).toBeUndefined();
    expect(related).toHaveLength(TOOL_REGISTRY.length - 1);
  });
});
