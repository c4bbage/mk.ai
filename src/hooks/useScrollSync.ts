/**
 * useScrollSync - 锚点滚动同步 Hook（Step 9 规格的骨架实现）
 *
 * 设计要点：
 * - 编辑端驱动为主（默认），可配置预览驱动
 * - passive 监听 + rAF 合并事件，避免滚动风暴
 * - "块顶 + 行内偏移插值" 定位策略 + ResizeObserver 次帧校正
 * - syncLock 防止循环触发
 */
import { useEffect, useRef, useCallback } from 'react'

export interface BlockPosition { offsetTop: number; height: number }
export interface LineIndex {
  getBlockAtLine: (line: number) => { id: string; startLine: number; endLine: number } | undefined
}
export interface PositionIndex {
  getByBlockId: (id: string) => BlockPosition | undefined
}

export type ScrollSyncMode = 'editor_drives' | 'preview_drives' | 'bidirectional'

export interface UseScrollSyncOptions {
  editorRef: { getScrollContainer: () => HTMLElement | null; scrollTo: (top: number) => void; getTopLine?: () => number; getCursorLine?: () => number }
  previewRef: { getScrollContainer: () => HTMLElement | null; scrollTo: (top: number) => void; scrollToOffset?: (top: number) => void; getBlockOffsetById?: (id: string) => BlockPosition | undefined }
  lineIndex: LineIndex
  positionIndex: PositionIndex
  mode?: ScrollSyncMode
  anchorPadding?: number // 细微视觉校正，默认 0
}

export interface UseScrollSyncAPI {
  enable: () => void
  disable: () => void
  scrollToAnchor: (line: number) => void
  onTocJump: (line: number) => void
  onSearchJump: (line: number) => void
}

export function useScrollSync(opts: UseScrollSyncOptions): UseScrollSyncAPI {
  const { editorRef, previewRef, lineIndex, positionIndex, mode = 'editor_drives', anchorPadding = 0 } = opts
  const enabledRef = useRef(true)
  const syncLockRef = useRef(false)
  const rafPendingRef = useRef(false)
  const pendingScrollTopRef = useRef<number | null>(null)

  const computeTargetOffset = useCallback((line: number): number | null => {
    const meta = lineIndex.getBlockAtLine(line)
    if (!meta) return null
    const pos = positionIndex.getByBlockId(meta.id)
    // 如果块还未挂载，先用估高插值，返回 null 表示需要先滚入视口后再次定位
    if (!pos) return null
    const lines = Math.max(1, meta.endLine - meta.startLine)
    const ratio = Math.min(1, Math.max(0, (line - meta.startLine) / lines))
    return pos.offsetTop + ratio * pos.height - anchorPadding
  }, [lineIndex, positionIndex, anchorPadding])

  const applyPreviewScroll = useCallback((top: number) => {
    const preview = previewRef.getScrollContainer()
    if (!preview) return
    if (typeof previewRef.scrollToOffset === 'function') {
      previewRef.scrollToOffset(top)
    } else {
      previewRef.scrollTo(top)
    }
  }, [previewRef])

  // 编辑端滚动 → 预览同步
  useEffect(() => {
    if (!enabledRef.current || mode === 'preview_drives') return
    const editor = editorRef.getScrollContainer()
    if (!editor) return

    const handler = (e: Event) => {
      if (syncLockRef.current) return
      pendingScrollTopRef.current = (e.target as HTMLElement).scrollTop
      if (rafPendingRef.current) return
      rafPendingRef.current = true
      requestAnimationFrame(() => {
        rafPendingRef.current = false
        const topLine = typeof editorRef.getTopLine === 'function' ? editorRef.getTopLine()! : 0
        const target = computeTargetOffset(topLine)
        if (target != null) {
          syncLockRef.current = true
          applyPreviewScroll(target)
          setTimeout(() => { syncLockRef.current = false }, 50)
        } else {
          // 目标块未挂载：可选策略是先根据块索引粗略滚入视口，然后由 PositionIndex 回填后再次触发
          // 具体实现留给 Codex 在 VirtualPreview 中提供 scrollToIndex + overscan 保障
        }
      })
    }

    editor.addEventListener('scroll', handler, { passive: true })
    return () => { editor.removeEventListener('scroll', handler as EventListener) }
  }, [editorRef, computeTargetOffset, applyPreviewScroll, mode])

  // 预览端滚动 → 编辑同步（可选）
  useEffect(() => {
    if (!enabledRef.current || (mode === 'editor_drives')) return
    const preview = previewRef.getScrollContainer()
    if (!preview) return
    const handler = (e: Event) => {
      if (syncLockRef.current) return
      if (rafPendingRef.current) return
      rafPendingRef.current = true
      requestAnimationFrame(() => {
        rafPendingRef.current = false
        const scrollTop = (e.target as HTMLElement).scrollTop
        // 反向映射策略较复杂（offset→行号），这里交由 Codex 实现：
        // 可结合 PositionIndex 中的块位置信息进行二分查找，得到块 id 与块内行比率，再换算为编辑端行号。
        // 暂以直接比例映射作为兜底（待实现）：
        const editor = editorRef.getScrollContainer()
        if (editor) {
          const ratio = scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight)
          const target = ratio * Math.max(1, editor.scrollHeight - editor.clientHeight)
          syncLockRef.current = true
          editorRef.scrollTo(target)
          setTimeout(() => { syncLockRef.current = false }, 50)
        }
      })
    }
    preview.addEventListener('scroll', handler, { passive: true })
    return () => { preview.removeEventListener('scroll', handler as EventListener) }
  }, [previewRef, editorRef, mode])

  const enable = useCallback(() => { enabledRef.current = true }, [])
  const disable = useCallback(() => { enabledRef.current = false }, [])
  const scrollToAnchor = useCallback((line: number) => {
    const target = computeTargetOffset(line)
    if (target != null) {
      applyPreviewScroll(target)
      // 次帧校正在 PositionIndex 更新后由调用方触发（例如 VirtualPreview 的 ResizeObserver 回调中）
    } else {
      // 块尚未挂载：调用方应先将目标块滚入视口再重试
    }
  }, [computeTargetOffset, applyPreviewScroll])

  const onTocJump = useCallback((line: number) => scrollToAnchor(line), [scrollToAnchor])
  const onSearchJump = useCallback((line: number) => scrollToAnchor(line), [scrollToAnchor])

  return { enable, disable, scrollToAnchor, onTocJump, onSearchJump }
}
