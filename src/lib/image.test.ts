/**
 * BDD tests for image utilities
 */
import { describe, it, expect } from 'vitest';
import {
  generateImageFileName,
  getAssetsDir,
  getImagesDir,
} from './image';

describe('getAssetsDir', () => {
  it('should replace .md with .assets', () => {
    expect(getAssetsDir('/Users/test/doc.md')).toBe('/Users/test/doc.assets');
  });

  it('should replace .markdown with .assets', () => {
    expect(getAssetsDir('/path/to/file.markdown')).toBe('/path/to/file.assets');
  });

  it('should be case-insensitive for extension', () => {
    expect(getAssetsDir('/path/README.MD')).toBe('/path/README.assets');
  });
});

describe('getImagesDir', () => {
  it('should return images dir relative to file', () => {
    expect(getImagesDir('/Users/test/doc.md')).toBe('/Users/test/images');
  });

  it('should return "images" for bare filename', () => {
    expect(getImagesDir('doc.md')).toBe('images');
  });
});

describe('generateImageFileName', () => {
  it('should generate a filename with date and random suffix', () => {
    const name = generateImageFileName('photo.png');
    expect(name).toMatch(/^image-\d{8}-\d{6}-[a-z0-9]{4}\.png$/);
  });

  it('should default to .png when no original name', () => {
    const name = generateImageFileName();
    expect(name).toMatch(/\.png$/);
  });

  it('should preserve original extension', () => {
    const name = generateImageFileName('screenshot.jpg');
    expect(name).toMatch(/\.jpg$/);
  });

  it('should generate unique names on successive calls', () => {
    const a = generateImageFileName('a.png');
    const b = generateImageFileName('b.png');
    expect(a).not.toBe(b);
  });
});
