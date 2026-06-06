import { describe, it, expect } from 'vitest';
import { computeTargetDimensions } from '../../src/lib/resize-dimensions';

describe('computeTargetDimensions', () => {
  it('lock on, width given → height scales proportionally', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: null, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock on, height given → width scales proportionally', () => {
    expect(computeTargetDimensions(1600, 1200, { width: null, height: 600, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock on, both given → width wins, height recomputed', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: 999, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock off, both given → exact dimensions (may distort)', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: 400, lockAspect: false }))
      .toEqual({ width: 800, height: 400 });
  });
  it('rounds proportional dimension to nearest integer', () => {
    expect(computeTargetDimensions(1000, 333, { width: 100, height: null, lockAspect: true }))
      .toEqual({ width: 100, height: 33 });
  });
  it('throws when locked and no dimension given', () => {
    expect(() => computeTargetDimensions(800, 600, { width: null, height: null, lockAspect: true }))
      .toThrow(/enter a width or height/i);
  });
  it('throws when unlocked and a dimension is missing', () => {
    expect(() => computeTargetDimensions(800, 600, { width: 800, height: null, lockAspect: false }))
      .toThrow(/both/i);
  });
  it('throws when target is out of range', () => {
    expect(() => computeTargetDimensions(800, 600, { width: 30000, height: null, lockAspect: true }))
      .toThrow(/out of range/i);
  });
});
