/**
 * Markdown 块级解析
 * 将 Markdown 按块拆分，避免虚拟滚动时切割到一半
 */

export interface MarkdownBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'code' | 'table' | 'list' | 'blockquote' | 'hr' | 'math' | 'mermaid' | 'image' | 'html';
  content: string;
  level?: number; // for headings
}

/**
 * 将 Markdown 文本拆分为块
 * 保证每个块是完整的，不会被切割到一半
 */
export function parseMarkdownToBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split('\n');
  let currentBlock: string[] = [];
  let blockType: MarkdownBlock['type'] = 'paragraph';
  let inCodeBlock = false;
  let inMathBlock = false;
  let inTable = false;
  let codeBlockLang = '';
  let blockId = 0;

  const flushBlock = () => {
    if (currentBlock.length > 0) {
      const blockContent = currentBlock.join('\n');
      if (blockContent.trim()) {
        blocks.push({
          id: `block-${blockId++}`,
          type: blockType,
          content: blockContent,
        });
      }
      currentBlock = [];
      blockType = 'paragraph';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 代码块开始/结束
    if (trimmedLine.startsWith('```')) {
      if (!inCodeBlock) {
        flushBlock();
        inCodeBlock = true;
        codeBlockLang = trimmedLine.slice(3).trim();
        blockType = codeBlockLang === 'mermaid' ? 'mermaid' : 'code';
        currentBlock.push(line);
      } else {
        currentBlock.push(line);
        inCodeBlock = false;
        flushBlock();
      }
      continue;
    }

    // 数学公式块
    if (trimmedLine === '$$') {
      if (!inMathBlock) {
        flushBlock();
        inMathBlock = true;
        blockType = 'math';
        currentBlock.push(line);
      } else {
        currentBlock.push(line);
        inMathBlock = false;
        flushBlock();
      }
      continue;
    }

    // 在代码块或数学块内
    if (inCodeBlock || inMathBlock) {
      currentBlock.push(line);
      continue;
    }

    // 表格检测
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      if (!inTable) {
        flushBlock();
        inTable = true;
        blockType = 'table';
      }
      currentBlock.push(line);
      continue;
    } else if (inTable) {
      // 表格结束
      inTable = false;
      flushBlock();
    }

    // 空行 - 分割段落
    if (trimmedLine === '') {
      if (currentBlock.length > 0) {
        flushBlock();
      }
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      flushBlock();
      blocks.push({
        id: `block-${blockId++}`,
        type: 'heading',
        content: line,
        level: headingMatch[1].length,
      });
      continue;
    }

    // 水平线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
      flushBlock();
      blocks.push({
        id: `block-${blockId++}`,
        type: 'hr',
        content: line,
      });
      continue;
    }

    // 引用块
    if (trimmedLine.startsWith('>')) {
      if (blockType !== 'blockquote') {
        flushBlock();
        blockType = 'blockquote';
      }
      currentBlock.push(line);
      continue;
    }

    // 列表
    if (/^(\d+\.|[-*+])\s/.test(trimmedLine)) {
      if (blockType !== 'list') {
        flushBlock();
        blockType = 'list';
      }
      currentBlock.push(line);
      continue;
    }

    // 图片（独占一行）
    if (/^!\[.*\]\(.*\)$/.test(trimmedLine)) {
      flushBlock();
      blocks.push({
        id: `block-${blockId++}`,
        type: 'image',
        content: line,
      });
      continue;
    }

    // 普通段落
    if (blockType !== 'paragraph' && blockType !== 'list' && blockType !== 'blockquote') {
      flushBlock();
      blockType = 'paragraph';
    }
    currentBlock.push(line);
  }

  // 处理最后一个块
  flushBlock();

  return blocks;
}

/**
 * 估算块的高度（用于虚拟滚动）
 */
export function estimateBlockHeight(block: MarkdownBlock, fontSize: number = 16): number {
  const lineHeight = fontSize * 1.6;
  const lines = block.content.split('\n').length;
  
  switch (block.type) {
    case 'heading':
      const level = block.level || 1;
      return fontSize * (3 - level * 0.3) + 32; // 标题更高
    case 'code':
    case 'mermaid':
      return Math.max(lines * lineHeight + 32, 100); // 代码块至少 100px
    case 'table':
      return lines * 40 + 20; // 表格行更高
    case 'image':
      return 300; // 图片预估高度
    case 'math':
      return lines * lineHeight + 40;
    case 'hr':
      return 40;
    default:
      return lines * lineHeight + 16;
  }
}
