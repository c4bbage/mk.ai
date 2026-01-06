/**
 * 块级 Diff 算法
 * 对比新旧块列表，只更新变化的部分
 */

import { type MarkdownBlock } from './markdown-blocks';

export interface BlockChange {
  type: 'add' | 'remove' | 'update' | 'move';
  index: number;
  block?: MarkdownBlock;
  oldBlock?: MarkdownBlock;
}

/**
 * 计算两个块列表的差异
 * 使用简化的 LCS (Longest Common Subsequence) 算法
 */
export function diffBlocks(
  oldBlocks: MarkdownBlock[],
  newBlocks: MarkdownBlock[]
): BlockChange[] {
  const changes: BlockChange[] = [];
  
  // 创建内容到块的映射
  const oldMap = new Map<string, { block: MarkdownBlock; index: number }[]>();
  oldBlocks.forEach((block, index) => {
    const key = getBlockKey(block);
    if (!oldMap.has(key)) {
      oldMap.set(key, []);
    }
    oldMap.get(key)!.push({ block, index });
  });
  
  const usedOldIndices = new Set<number>();
  const matchedNewIndices = new Set<number>();
  
  // 第一遍：找到完全匹配的块
  newBlocks.forEach((newBlock, newIndex) => {
    const key = getBlockKey(newBlock);
    const candidates = oldMap.get(key);
    
    if (candidates && candidates.length > 0) {
      // 找到未使用的旧块
      const match = candidates.find(c => !usedOldIndices.has(c.index));
      if (match) {
        usedOldIndices.add(match.index);
        matchedNewIndices.add(newIndex);
        
        // 如果位置不同，记录移动
        if (match.index !== newIndex) {
          changes.push({
            type: 'move',
            index: newIndex,
            block: newBlock,
            oldBlock: match.block,
          });
        }
      }
    }
  });
  
  // 第二遍：处理删除的块
  oldBlocks.forEach((oldBlock, oldIndex) => {
    if (!usedOldIndices.has(oldIndex)) {
      changes.push({
        type: 'remove',
        index: oldIndex,
        oldBlock,
      });
    }
  });
  
  // 第三遍：处理新增的块
  newBlocks.forEach((newBlock, newIndex) => {
    if (!matchedNewIndices.has(newIndex)) {
      // 检查是否是内容更新（同位置但内容变了）
      const oldBlock = oldBlocks[newIndex];
      if (oldBlock && !usedOldIndices.has(newIndex)) {
        changes.push({
          type: 'update',
          index: newIndex,
          block: newBlock,
          oldBlock,
        });
      } else {
        changes.push({
          type: 'add',
          index: newIndex,
          block: newBlock,
        });
      }
    }
  });
  
  return changes;
}

/**
 * 生成块的唯一键
 */
function getBlockKey(block: MarkdownBlock): string {
  // 使用类型 + 内容前100字符作为键
  return `${block.type}:${block.content.slice(0, 100)}`;
}

/**
 * 检查是否需要完全重渲染
 * 变化超过 50% 时建议完全重渲染
 */
export function shouldFullRerender(
  changes: BlockChange[],
  totalBlocks: number
): boolean {
  if (totalBlocks === 0) return true;
  
  const changeRatio = changes.length / totalBlocks;
  return changeRatio > 0.5;
}

/**
 * 统计变化
 */
export function getChangeStats(changes: BlockChange[]): {
  added: number;
  removed: number;
  updated: number;
  moved: number;
} {
  return {
    added: changes.filter(c => c.type === 'add').length,
    removed: changes.filter(c => c.type === 'remove').length,
    updated: changes.filter(c => c.type === 'update').length,
    moved: changes.filter(c => c.type === 'move').length,
  };
}
