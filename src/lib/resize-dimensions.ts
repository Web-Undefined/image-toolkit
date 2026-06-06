export interface ResizeOpts {
  width: number | null;   // requested width in px, or null when blank
  height: number | null;  // requested height in px, or null when blank
  lockAspect: boolean;
}

export function computeTargetDimensions(
  origW: number,
  origH: number,
  opts: ResizeOpts,
): { width: number; height: number } {
  const w = opts.width && opts.width > 0 ? opts.width : 0;
  const h = opts.height && opts.height > 0 ? opts.height : 0;

  let tw: number;
  let th: number;
  if (opts.lockAspect) {
    if (w > 0) {
      tw = w;
      th = Math.round(origH * (w / origW));
    } else if (h > 0) {
      th = h;
      tw = Math.round(origW * (h / origH));
    } else {
      throw new Error('Enter a width or height.');
    }
  } else {
    if (w > 0 && h > 0) {
      tw = w;
      th = h;
    } else {
      throw new Error('Enter both a width and height.');
    }
  }

  if (tw < 1 || th < 1 || tw > 20000 || th > 20000) {
    throw new Error('Target size is out of range.');
  }
  return { width: tw, height: th };
}
