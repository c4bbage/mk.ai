/**
 * Markdown 解析 Web Worker
 * 在后台线程解析 Markdown，不阻塞 UI
 */

import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';

export interface WorkerMessage {
  type: 'parse';
  id: string;
  content: string;
}

export interface WorkerResponse {
  type: 'parsed';
  id: string;
  blocks: MarkdownBlock[];
  parseTime: number;
}

// Worker 消息处理
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, content } = event.data;
  
  if (type === 'parse') {
    const startTime = performance.now();
    
    try {
      const blocks = parseMarkdownToBlocks(content);
      const parseTime = performance.now() - startTime;
      
      const response: WorkerResponse = {
        type: 'parsed',
        id,
        blocks,
        parseTime,
      };
      
      self.postMessage(response);
    } catch (error) {
      console.error('Worker parse error:', error);
      
      // 返回空块列表
      const response: WorkerResponse = {
        type: 'parsed',
        id,
        blocks: [],
        parseTime: 0,
      };
      
      self.postMessage(response);
    }
  }
};

export {};
