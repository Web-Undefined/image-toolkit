import type { OutputFormat } from '../types';

export function outputName(input: string, ext: OutputFormat): string {
  const dot = input.lastIndexOf('.');
  const base = dot === -1 ? input : input.slice(0, dot);
  return `${base}.${ext}`;
}
