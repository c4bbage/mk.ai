/**
 * BDD tests for auto-save backup/restore logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBackupsForRestore, clearBackup, clearLocalBackup, getLocalBackup, type BackupEntry } from './useAutoSave';

// Mock localStorage with full API
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  get length() { return Object.keys(store).length; },
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

function makeBackupEntry(overrides: Partial<BackupEntry> = {}): BackupEntry {
  return {
    tabId: 'tab-test-1',
    content: '# Hello',
    fileName: 'test.md',
    filePath: '/test/file.md',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('getBackupsForRestore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return empty array when no backups exist', () => {
    expect(getBackupsForRestore()).toEqual([]);
  });

  it('should return parsed backup when valid data exists', () => {
    const entry = makeBackupEntry();
    store[`md-ai-backup-${entry.tabId}`] = JSON.stringify(entry);
    const results = getBackupsForRestore();
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('# Hello');
    expect(results[0].filePath).toBe('/test/file.md');
  });

  it('should skip corrupted backups', () => {
    store['md-ai-backup-corrupt'] = 'not-json{{{';
    expect(getBackupsForRestore()).toEqual([]);
    expect(store['md-ai-backup-corrupt']).toBeUndefined();
  });

  it('should return backup without filePath (untitled tab)', () => {
    const entry = makeBackupEntry({ filePath: undefined, fileName: 'untitled.md' });
    store[`md-ai-backup-${entry.tabId}`] = JSON.stringify(entry);
    const results = getBackupsForRestore();
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('# Hello');
    expect(results[0].filePath).toBeUndefined();
    expect(results[0].fileName).toBe('untitled.md');
  });

  it('should sort backups by timestamp newest first', () => {
    const old = makeBackupEntry({ tabId: 'tab-old', timestamp: Date.now() - 1000 });
    const recent = makeBackupEntry({ tabId: 'tab-recent', timestamp: Date.now() });
    store[`md-ai-backup-${old.tabId}`] = JSON.stringify(old);
    store[`md-ai-backup-${recent.tabId}`] = JSON.stringify(recent);
    const results = getBackupsForRestore();
    expect(results[0].tabId).toBe('tab-recent');
    expect(results[1].tabId).toBe('tab-old');
  });

  it('should remove stale backups older than 24h', () => {
    const stale = makeBackupEntry({ tabId: 'tab-stale', timestamp: Date.now() - 25 * 60 * 60 * 1000 });
    store[`md-ai-backup-${stale.tabId}`] = JSON.stringify(stale);
    const results = getBackupsForRestore();
    expect(results).toEqual([]);
    expect(store[`md-ai-backup-${stale.tabId}`]).toBeUndefined();
  });

  it('should skip entries with missing content field', () => {
    store['md-ai-backup-bad'] = JSON.stringify({ tabId: 'bad', fileName: 'x.md', timestamp: Date.now() });
    const results = getBackupsForRestore();
    expect(results).toEqual([]);
  });
});

describe('clearBackup', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should remove the specified tab backup', () => {
    const entry = makeBackupEntry({ tabId: 'tab-x' });
    store[`md-ai-backup-tab-x`] = JSON.stringify(entry);
    clearBackup('tab-x');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('md-ai-backup-tab-x');
    expect(store['md-ai-backup-tab-x']).toBeUndefined();
  });

  it('should not throw when backup does not exist', () => {
    expect(() => clearBackup('nonexistent')).not.toThrow();
  });
});

describe('getLocalBackup (legacy compatibility)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return null when no backup exists', () => {
    expect(getLocalBackup()).toBeNull();
  });

  it('should return the newest backup', () => {
    const entry = makeBackupEntry({ content: '# Legacy' });
    store[`md-ai-backup-${entry.tabId}`] = JSON.stringify(entry);
    const result = getLocalBackup();
    expect(result).not.toBeNull();
    expect(result!.content).toBe('# Legacy');
  });

  it('should return null for corrupted data', () => {
    store['md-ai-backup-bad'] = 'not-json{{{';
    expect(getLocalBackup()).toBeNull();
  });
});

describe('clearLocalBackup (legacy compatibility)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should remove all backups', () => {
    const entry1 = makeBackupEntry({ tabId: 'tab-1' });
    const entry2 = makeBackupEntry({ tabId: 'tab-2' });
    store['md-ai-backup-tab-1'] = JSON.stringify(entry1);
    store['md-ai-backup-tab-2'] = JSON.stringify(entry2);
    clearLocalBackup();
    expect(store['md-ai-backup-tab-1']).toBeUndefined();
    expect(store['md-ai-backup-tab-2']).toBeUndefined();
  });

  it('should not throw when no backup exists', () => {
    expect(() => clearLocalBackup()).not.toThrow();
  });
});
