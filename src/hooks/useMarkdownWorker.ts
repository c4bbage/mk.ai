/**
 * Markdown Worker Hook
 * 使用 Web Worker 在后台解析 Markdown
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';

interface UseMarkdownWorkerOptions {
  /** 内容 */
  content: string;
  /** 是否启用 Worker (默认大文档启用) */
  useWorker?: boolean;
  /** 大文档阈值 (字符数) */
  threshold?: number;
}

interface UseMarkdownWorkerResult {
  /** 解析后的块 */
  blocks: MarkdownBlock[];
  /** 是否正在解析 */
  isParsing: boolean;
  /** 解析耗时 (ms) */
  parseTime: number;
}

// 简单的内联 Worker
function createWorker(): Worker | null {
  try {
    const workerCode = `
      const parseMarkdownToBlocks = ${parseMarkdownToBlocks.toString()};
      
      self.onmessage = (event) => {
        const { type, id, content } = event.data;
        
        if (type === 'parse') {
          const startTime = performance.now();
          try {
            const blocks = parseMarkdownToBlocks(content);
            const parseTime = performance.now() - startTime;
            self.postMessage({ type: 'parsed', id, blocks, parseTime });
          } catch (error) {
            self.postMessage({ type: 'parsed', id, blocks: [], parseTime: 0 });
          }
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    
    // 清理 URL
    URL.revokeObjectURL(url);
    
    return worker;
  } catch {
    console.warn('Web Worker not supported, falling back to main thread');
    return null;
  }
}

export function useMarkdownWorker({
  content,
  useWorker = true,
  threshold = 30000, // 30KB 以上使用 Worker
}: UseMarkdownWorkerOptions): UseMarkdownWorkerResult {
  const [blocks, setBlocks] = useState<MarkdownBlock[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseTime, setParseTime] = useState(0);
  
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  
  // 是否应该使用 Worker
  const shouldUseWorker = useWorker && content.length > threshold;
  
  // 初始化 Worker
  useEffect(() => {
    if (shouldUseWorker && !workerRef.current) {
      workerRef.current = createWorker();
      
      if (workerRef.current) {
        workerRef.current.onmessage = (event) => {
          const { id, blocks: parsedBlocks, parseTime: time } = event.data;
          
          // 只处理最新的请求
          if (id === requestIdRef.current.toString()) {
            setBlocks(parsedBlocks);
            setParseTime(time);
            setIsParsing(false);
          }
        };
      }
    }
    
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [shouldUseWorker]);
  
  // 解析内容
  const parse = useCallback(() => {
    if (!content) {
      setBlocks([]);
      setParseTime(0);
      return;
    }
    
    requestIdRef.current++;
    const currentId = requestIdRef.current.toString();
    
    if (shouldUseWorker && workerRef.current) {
      // 使用 Worker
      setIsParsing(true);
      workerRef.current.postMessage({
        type: 'parse',
        id: currentId,
        content,
      });
    } else {
      // 主线程解析
      setIsParsing(true);
      
      // 使用 requestIdleCallback 或 setTimeout 避免阻塞
      const runParse = () => {
        const startTime = performance.now();
        const parsedBlocks = parseMarkdownToBlocks(content);
        const time = performance.now() - startTime;
        
        setBlocks(parsedBlocks);
        setParseTime(time);
        setIsParsing(false);
      };
      
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => void })
          .requestIdleCallback(runParse);
      } else {
        setTimeout(runParse, 0);
      }
    }
  }, [content, shouldUseWorker]);
  
  // 内容变化时解析
  useEffect(() => {
    parse();
  }, [parse]);
  
  return { blocks, isParsing, parseTime };
}
