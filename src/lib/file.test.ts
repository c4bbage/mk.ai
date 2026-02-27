/**
 * BDD tests for file operations
 */
import { describe, it, expect } from 'vitest';
import { getFileName, getDirectory, validateFilePath, validateContent, isAllowedExtension } from './file';

describe('getFileName', () => {
  it('should extract filename from Unix path', () => {
    expect(getFileName('/Users/test/documents/readme.md')).toBe('readme.md');
  });

  it('should extract filename from Windows path', () => {
    expect(getFileName('C:\\Users\\test\\documents\\readme.md')).toBe('readme.md');
  });

  it('should return the input if no separator found', () => {
    expect(getFileName('readme.md')).toBe('readme.md');
  });

  it('should handle paths ending with separator', () => {
    // pop() returns '' for trailing slash, fallback returns full path
    expect(getFileName('/Users/test/')).toBe('/Users/test/');
  });

  it('should handle deeply nested paths', () => {
    expect(getFileName('/a/b/c/d/e/f/g.md')).toBe('g.md');
  });

  it('should handle filenames with spaces', () => {
    expect(getFileName('/Users/test/my document.md')).toBe('my document.md');
  });

  it('should handle filenames with Chinese characters', () => {
    expect(getFileName('/Users/test/文档/笔记.md')).toBe('笔记.md');
  });

  it('should handle mixed separators', () => {
    expect(getFileName('C:\\Users/test\\docs/file.md')).toBe('file.md');
  });
});

describe('getDirectory', () => {
  it('should extract directory from Unix path', () => {
    expect(getDirectory('/Users/test/documents/readme.md')).toBe('/Users/test/documents');
  });

  it('should extract directory from Windows path', () => {
    // Windows backslashes get split, rejoined with /
    expect(getDirectory('C:\\Users\\test\\readme.md')).toBe('C:/Users/test');
  });

  it('should return "." for bare filename', () => {
    expect(getDirectory('readme.md')).toBe('.');
  });

  it('should handle root-level files', () => {
    // split('/readme.md') => ['', 'readme.md'], pop removes 'readme.md', join => '.' fallback
    expect(getDirectory('/readme.md')).toBe('.');
  });

  it('should handle deeply nested paths', () => {
    expect(getDirectory('/a/b/c/d/file.md')).toBe('/a/b/c/d');
  });
});

describe('validateFilePath', () => {
  it('should return null for valid Unix path', () => {
    expect(validateFilePath('/Users/test/doc.md')).toBeNull();
  });

  it('should return null for valid Windows path', () => {
    expect(validateFilePath('C:\\Users\\test\\doc.md')).toBeNull();
  });

  it('should reject empty string', () => {
    expect(validateFilePath('')).toBe('文件路径不能为空');
  });

  it('should reject whitespace-only string', () => {
    expect(validateFilePath('   ')).toBe('文件路径不能为空');
  });

  it('should reject paths with null bytes', () => {
    expect(validateFilePath('/Users/test\0/doc.md')).toBe('文件路径包含非法字符');
  });

  it('should reject paths longer than 1024 chars', () => {
    const longPath = '/' + 'a'.repeat(1025);
    expect(validateFilePath(longPath)).toBe('文件路径过长');
  });

  it('should accept paths with Chinese characters', () => {
    expect(validateFilePath('/Users/test/文档/笔记.md')).toBeNull();
  });

  it('should accept paths with spaces', () => {
    expect(validateFilePath('/Users/test/my docs/file.md')).toBeNull();
  });
});

describe('validateContent', () => {
  it('should return null for valid content', () => {
    expect(validateContent('# Hello World')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(validateContent('')).toBeNull();
  });

  it('should reject null content', () => {
    expect(validateContent(null as unknown as string)).toBe('内容不能为空');
  });

  it('should reject undefined content', () => {
    expect(validateContent(undefined as unknown as string)).toBe('内容不能为空');
  });

  it('should reject non-string content', () => {
    expect(validateContent(123 as unknown as string)).toBe('内容必须是字符串');
  });

  it('should reject content exceeding 10 MB', () => {
    const huge = 'x'.repeat(10 * 1024 * 1024 + 1);
    expect(validateContent(huge)).toContain('文件内容过大');
  });

  it('should accept content just under 10 MB', () => {
    const big = 'x'.repeat(10 * 1024 * 1024);
    expect(validateContent(big)).toBeNull();
  });
});

describe('isAllowedExtension', () => {
  it('should allow .md files', () => {
    expect(isAllowedExtension('readme.md')).toBe(true);
  });

  it('should allow .markdown files', () => {
    expect(isAllowedExtension('doc.markdown')).toBe(true);
  });

  it('should allow .txt files', () => {
    expect(isAllowedExtension('notes.txt')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isAllowedExtension('README.MD')).toBe(true);
    expect(isAllowedExtension('doc.TXT')).toBe(true);
  });

  it('should reject .js files', () => {
    expect(isAllowedExtension('script.js')).toBe(false);
  });

  it('should reject .html files', () => {
    expect(isAllowedExtension('page.html')).toBe(false);
  });

  it('should reject files with no extension', () => {
    expect(isAllowedExtension('Makefile')).toBe(false);
  });
});
