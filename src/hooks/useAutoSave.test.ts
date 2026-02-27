/**
 * BDD tests for auto-save backup/restore logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLocalBackup, clearLocalBackup } from './useAutoSave';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('getLocalBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return null when no backup exists', () => {
    expect(getLocalBackup()).toBeNull();
  });

  it('should return parsed backup when valid data exists', () => {
    const backup = { content: '# Hello', filePath: '/test/file.md', timestamp: Date.now() };
    localStorageMock.setItem('md-ai-backup', JSON.stringify(backup));
    const result = getLocalBackup();
    expect(result).toEqual(backup);
  });

  it('should return null when backup data is invalid JSON', () => {
    localStorageMock.setItem('md-ai-backup', 'not-json{{{');
    // getLocalBackup catches parse errors
    expect(getLocalBackup()).toBeNull();
  });

  it('should return backup without filePath', () => {
    const backup = { content: 'test content', timestamp: 1000 };
    localStorageMock.setItem('md-ai-backup', JSON.stringify(backup));
    const result = getLocalBackup();
    expect(result).not.toBeNull();
    expect(result!.content).toBe('test content');
    expect(result!.filePath).toBeUndefined();
  });
});

describe('clearLocalBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should remove the backup from localStorage', () => {
    localStorageMock.setItem('md-ai-backup', JSON.stringify({ content: 'x', timestamp: 1 }));
    clearLocalBackup();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('md-ai-backup');
  });

  it('should not throw when no backup exists', () => {
    expect(() => clearLocalBackup()).not.toThrow();
  });
});
