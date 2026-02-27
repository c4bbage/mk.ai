/**
 * BlockStore interface and skeleton implementation (Step 6)
 * - Manages block metadata, line→block index, LRU cache, and worker coordination
 */

import type { MarkdownBlock } from './markdown-blocks';

export interface BlockMeta {
  id: string;
  type: MarkdownBlock['type'];
  startLine: number;
  endLine: number;
  level?: number;
  hash: string;
  heightEst: number;
  content: string;
}

export interface BlockRender {
  id: string;
  html: string;
  metrics?: Record<string, number>;
}

export interface CodeMirrorChange {
  from: number; // line start
  to: number;   // line end
  inserted: string; // inserted content
}

export interface BlockPatch {
  id: string;
  type: 'add' | 'remove' | 'update' | 'move';
  meta?: BlockMeta;
}

export interface BlockStoreStats {
  blocks: number;
  cached: number;
  coldMiss: number;
  memBytes: number;
}

export interface BlockStoreOptions {
  lruLimit?: number;
  lruBytesLimit?: number;
}

export interface IBlockStore {
  init(content: string): Promise<void>;
  reset(): void;
  setContent(content: string): Promise<BlockPatch[]>;
  applyChanges(changes: CodeMirrorChange[]): Promise<BlockPatch[]>;

  getMetaById(id: string): BlockMeta | undefined;
  getBlockAtLine(line: number): BlockMeta | undefined;
  getRange(startLine: number, endLine: number): BlockMeta[];
  getAll(): BlockMeta[];

  warmUp(): Promise<void>;
  hydrateFromCache(metas: BlockMeta[]): BlockRender[];
  requestRender(metas: BlockMeta[], options?: { priority?: 'low' | 'normal' | 'high' }): Promise<BlockRender[]>;

  setLRULimit(maxEntries: number, maxBytes?: number): void;
  persist(): Promise<void>;
  restore(): Promise<void>;

  getStats(): BlockStoreStats;
}

// Simple hash function placeholder (replace with xxhash or crypto.subtle.digest)
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

export class BlockStore implements IBlockStore {
  private metas: BlockMeta[] = [];
  private idIndex: Map<string, BlockMeta> = new Map();
  private lru: Map<string, BlockRender> = new Map(); // key: hash
  private coldMiss = 0;
  private memBytes = 0;
  private lruLimit = 200;
  private lruBytesLimit = 5 * 1024 * 1024; // 5MB of HTML strings approx

  constructor(opts?: BlockStoreOptions) {
    if (opts?.lruLimit) this.lruLimit = opts.lruLimit;
    if (opts?.lruBytesLimit) this.lruBytesLimit = opts.lruBytesLimit;
  }

  async init(content: string): Promise<void> {
    this.reset();
    await this.setContent(content);
  }

  reset(): void {
    this.metas = [];
    this.idIndex.clear();
    this.lru.clear();
    this.coldMiss = 0;
    this.memBytes = 0;
  }

  async setContent(content: string): Promise<BlockPatch[]> {
    // naive split via existing parseMarkdownToBlocks; add hash and line ranges
    const { parseMarkdownToBlocks, estimateBlockHeight } = await import('./markdown-blocks');
    const blocks = parseMarkdownToBlocks(content);

    let cursor = 0;
    const metas: BlockMeta[] = blocks.map((b, i) => {
      const lines = b.content.split('\n').length;
      const startLine = cursor;
      const endLine = cursor + lines - 1;
      cursor = endLine + 1;
      const hash = simpleHash(`${b.type}:${b.content}`);
      const heightEst = estimateBlockHeight(b);
      const id = b.id || `blk-${i}-${startLine}`;
      return { id, type: b.type, startLine, endLine, level: (b as any).level, hash, heightEst, content: b.content };
    });

    this.metas = metas;
    this.idIndex.clear();
    metas.forEach(m => this.idIndex.set(m.id, m));

    // For initial set, report full replace as patches
    return metas.map(m => ({ id: m.id, type: 'add', meta: m }));
  }

  async applyChanges(changes: CodeMirrorChange[]): Promise<BlockPatch[]> {
    // Placeholder: recompute full metas; Codex to implement incremental mapping via change ranges
    const fullContent = changes.reduce((acc, c) => acc + c.inserted, '');
    return this.setContent(fullContent);
  }

  getMetaById(id: string): BlockMeta | undefined {
    return this.idIndex.get(id);
  }

  getBlockAtLine(line: number): BlockMeta | undefined {
    return this.metas.find(m => m.startLine <= line && line <= m.endLine);
  }

  getRange(startLine: number, endLine: number): BlockMeta[] {
    return this.metas.filter(m => !(m.endLine < startLine || m.startLine > endLine));
  }

  getAll(): BlockMeta[] {
    return this.metas;
  }

  async warmUp(): Promise<void> {
    // Future: pre-render visible+adjacent blocks via worker
    return;
  }

  hydrateFromCache(metas: BlockMeta[]): BlockRender[] {
    const renders: BlockRender[] = [];
    metas.forEach(m => {
      const hit = this.lru.get(m.hash);
      if (hit) {
        // refresh LRU order
        this.lru.delete(m.hash);
        this.lru.set(m.hash, hit);
        renders.push({ id: m.id, html: hit.html, metrics: hit.metrics });
      } else {
        this.coldMiss++;
      }
    });
    return renders;
  }

  async requestRender(metas: BlockMeta[], _options?: { priority?: 'low' | 'normal' | 'high' }): Promise<BlockRender[]> {
    void _options;
    // Call pipeline.worker with block content; sanitize happens in worker
    const worker = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const content = metas.map(m => m.content).join('\n\n');

    const result: BlockRender[] = await new Promise((resolve) => {
      worker.onmessage = (ev: MessageEvent<any>) => {
        const { type, blocks } = ev.data || {};
        if (type !== 'rendered') return;
        const renders: BlockRender[] = (blocks || []).map((b: any) => ({ id: b.id, html: b.html }));
        resolve(renders);
        worker.terminate();
      };
      worker.postMessage({ type: 'render', id, content });
    });

    // Update LRU
    result.forEach((r, i) => {
      const meta = metas[i];
      if (!meta) return;
      const size = r.html.length;
      this.lru.set(meta.hash, r);
      this.memBytes += size;
      // enforce limits
      while (this.lru.size > this.lruLimit || this.memBytes > this.lruBytesLimit) {
        const firstKey = this.lru.keys().next().value;
        if (firstKey) {
          const v = this.lru.get(firstKey)!;
          this.memBytes -= v.html.length;
          this.lru.delete(firstKey);
        } else {
          break;
        }
      }
    });

    return result;
  }

  setLRULimit(maxEntries: number, maxBytes?: number): void {
    this.lruLimit = maxEntries;
    if (maxBytes) this.lruBytesLimit = maxBytes;
  }

  async persist(): Promise<void> {
    // TODO: IndexedDB persistence (md.ai.blockstore)
    return;
  }

  async restore(): Promise<void> {
    // TODO: load from IndexedDB and prime LRU
    return;
  }

  getStats(): BlockStoreStats {
    return {
      blocks: this.metas.length,
      cached: this.lru.size,
      coldMiss: this.coldMiss,
      memBytes: this.memBytes,
    };
  }
}
