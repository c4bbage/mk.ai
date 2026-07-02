# Step 5 Architecture Spec — Incremental Patch Protocol and Mirror Text (claude)

Purpose
- Define a concrete, implementable architecture for Step 5: main-thread only sends incremental changes; Worker maintains a mirror of the document (Rope/Piece Table), re-parses only affected blocks, returns block-level HTML patches.
- Provide precise interfaces, data models, sequencing, and acceptance criteria to enable codex to implement quickly and safely.

Scope and Goals
- Replace full-content render requests with an incremental patch protocol.
- Worker maintains authoritative mirrored text and block index; main thread is stateless regarding markdown parsing.
- Re-render only impacted blocks; preserve block IDs and keys for React.
- Reduce IPC payloads by batching and transferring binary buffers.
- Meet Step 5 acceptance criteria:
  - High-frequency input reduces IPC overhead significantly; preview latency p95 < 200ms for large docs.
  - History (undo/redo) and preview consistency pass tests.

Key Constraints and Prior Art in Repo
- Existing Worker: src/workers/pipeline.worker.ts renders blocks from full content.
- Existing Hook: src/hooks/usePipelineWorker.ts handles versioning and fallback.
- Existing block splitter: src/lib/markdown-blocks.ts (coarse block split).
- Markdown renderer: src/lib/markdown.ts (marked + highlight.js + KaTeX placeholders + sanitize in worker).

High-level Architecture
1) Main thread
- Editor (CodeMirror) emits change sets (from, to, inserted) via updateListener; compositionstart/end pauses batching.
- A new hook usePatchWorker batches changes for 50–150ms (adaptive), assigns seq/docVersion, and sends PatchRequest to Worker.
- Applies only latest PatchResponse (seq/docVersion guard); integrates changed blocks into Preview/VirtualPreview by replacing block HTML for changed IDs.

2) Worker (single pipeline worker)
- Maintains:
  - MirrorText: Rope/Piece Table (initial minimal PieceTable implementation), line index.
  - BlockStore: array/map of BlockMeta, stable IDs, startLine/endLine, hash, level, type.
- On PatchRequest:
  - Apply changes to MirrorText; update line index incrementally.
  - Compute affected region and safe margins (expand across neighboring complex blocks: list/table/blockquote/code fences).
  - Re-split and re-render only affected blocks; sanitize HTML; compute new hashes.
  - Return PatchResponse with changedBlocks, updated docVersion/seq, metrics.

Interfaces (TypeScript)
- Main → Worker
  interface PatchChange {
    from: number;          // byte offset in UTF-16 code units or UTF-8 bytes (see encoding policy)
    to: number;            // same unit as from
    insertedBytes?: ArrayBuffer; // optional transferable buffer with encoded text
    insertedText?: string; // fallback when not using transferable buffer
  }

  type PatchHint = 'fast' | 'full';

  interface PatchRequest {
    type: 'patch';
    seq: number;           // monotonically increasing per session
    docVersion: number;    // increment each accepted patch
    changes: PatchChange[];
    encoding: 'utf16' | 'utf8';
    hint?: PatchHint;      // 'fast': small changes; 'full': large/structural edits
  }

- Worker → Main
  interface ChangedBlock {
    id: string;            // stable block id
    type: 'heading' | 'paragraph' | 'code' | 'table' | 'list' | 'blockquote' | 'hr' | 'math' | 'mermaid' | 'image' | 'html';
    startLine: number;
    endLine: number;
    hash: string;          // content + rendering config hash
    html: string;          // sanitized HTML
    estHeight?: number;    // optional estimated height for virtual scroll
  }

  interface PatchResponse {
    type: 'patched';
    seq: number;           // echo
    docVersion: number;    // echo
    changedBlocks: ChangedBlock[];
    removedBlockIds: string[]; // if structure changed (merge/split blocks)
    metrics: {
      applyTime: number;   // ms to apply patch to mirror text
      parseTime: number;   // ms spent on block split + incremental parse
      renderTime: number;  // ms spent rendering affected blocks
      changedCount: number;
    };
  }

Encoding and Transfer Policy
- Prefer UTF-8 bytes in insertedBytes (TextEncoder on main thread), encoding='utf8'; avoid structured clone of large strings.
- Set insertedText only for small edits when building bytes is overhead.
- Transfer ArrayBuffer via postMessage to avoid copies. Consider SharedArrayBuffer later when COOP/COEP available.

MirrorText Data Structure
- Initial: PieceTable
  - Original buffer (immutable) + add buffer (append-only); pieces reference ranges.
  - Operations: insert (add buffer slice + piece), delete (adjust piece ranges), replace (delete + insert).
  - Maintains line index (array of newline offsets) incrementally by adjusting affected region; fallback to recomputing in local region when complex edits.
- Future: Rope for very large documents; not required in Step 5 MVP.

BlockStore Model
  interface BlockMeta {
    id: string;           // stable id 'block-N'
    type: ChangedBlock['type'];
    startLine: number;
    endLine: number;
    level?: number;       // headings only
    hash: string;
  }
- Stored in Worker; updated incrementally.
- ID stability: maintain ID by diffing old/new blocks by content hash + startLine proximity; generate new IDs only when content changed significantly or blocks split/merge.

Incremental Region and Safe Margins
- Given changes [{from, to, insertedLen}], map to line ranges via line index.
- Expand region by rules:
  - If within code fence/math block/table/list/blockquote, expand to entire block.
  - Include 1–2 neighboring blocks above/below for structural safety.
- Re-split only within expanded region; unaffected blocks remain unchanged.

Rendering Strategy
- Use existing parseMarkdown for each block content (coarse block content only) in Worker.
- Sanitization remains in Worker via sanitize-html.
- Two-phase result (optional):
  - Phase 1: minimal HTML (no heavy highlight), immediate return under heavy input.
  - Phase 2: full highlight for code blocks returned in subsequent PatchResponse; gated by hint/idle.

Main-thread Integration
- New hook: src/hooks/usePatchWorker.ts
  - Holds single Worker instance (pipeline.worker.ts extended for 'patch').
  - Maintains seq/docVersion; batches Editor changes 50–150ms (adaptive based on recent parse/render metrics).
  - Pauses during IME composition; on compositionend, flushes accumulated changes.
  - onmessage: if response.seq >= current seq && response.docVersion == local docVersion + appliedCount, apply changedBlocks to preview state; discard older responses.
- Editor wiring: src/components/Editor/Editor.tsx
  - In updateListener, collect CM6 change ranges: for each change in update.changes, map to {from, to} and insertedText; encode to Uint8Array for large inserts.
  - Debounce via usePatchWorker; pass hint='fast' for small edits, 'full' for paste/format operations.
- Preview rendering: src/components/Preview/VirtualPreview.tsx
  - Maintain block array state keyed by id. On PatchResponse:
    - Replace html/metadata for changedBlocks.
    - Remove blocks whose IDs in removedBlockIds.
    - Insert new blocks at correct positions (based on startLine ordering).
  - Prefer minimal React updates:
    - Keep component keys stable by id; only changed ids rerender.
    - Optionally use morphdom within BlockRenderer to patch inner HTML and preserve events.

Versioning, Cancellation, Consistency
- seq monotonically increases per request; Worker echoes seq; main thread applies only latest.
- docVersion increments per accepted patch; Worker stores version and validates order; out-of-order patches ignored.
- Support CANCEL message to Worker to drop queued heavy tasks under pressure.

Performance and Batching
- Adaptive batch window: 50–150ms (smaller for short docs/low metrics; larger for big docs/high metrics).
- Merge multiple CM6 changes within window into a single PatchRequest; keep changes ordered.
- Metrics returned per patch; use them to auto-tune window.

Safety and Security
- HTML sanitize exclusively in Worker (sanitize-html configured to disallow script/inline handlers/javascript: URLs).
- Trusted Types on main thread recommended; but innerHTML used only with sanitized content from Worker.

Acceptance Test Plan
- Consistency tests:
  - Undo/redo while typing: preview matches editor across sequences.
  - Concurrent input bursts: only latest seq applies; no flicker.
  - Structural edits: splitting/merging list/table/code fences keep block IDs stable where possible; removedBlockIds handled correctly.
- Performance tests:
  - Large doc (10k lines): IPC bytes per minute reduced vs full content; preview p95 < 200ms.
  - Input latency: editor remains <16ms; long tasks reduced.

Implementation Sequencing for codex
1) Extend Worker (src/workers/pipeline.worker.ts)
  - Add in-memory PieceTable and line index.
  - Add handlers for 'patch' messages; apply patch, recompute affected blocks, render changed blocks, sanitize, respond.
  - Persist BlockStore in Worker scope; ensure id stability.
2) Create hook src/hooks/usePatchWorker.ts
  - Single Worker instance; seq/docVersion; batching timer; composition pause; adaptive window.
  - Encode large inserts via TextEncoder to transferable ArrayBuffer.
3) Wire Editor → Patch
  - In Editor.tsx updateListener, collect changes; call usePatchWorker.enqueue(change, hint).
  - Add perf marks: editor_input → schedule_patch.
4) Update VirtualPreview
  - Maintain block list keyed by id; integrate PatchResponse by replacing only changed blocks.
  - Optional morphdom patch inside BlockRenderer for minimal DOM writes.
5) Instrument metrics and logs
  - Worker returns metrics; log via console.table in dev; expose perf overlay.
6) Tests
  - Unit tests for PieceTable (insert/delete/replace + line index updates).
  - Integration tests for incremental edits across block types (paragraph, list, code fence, table, math).
  - Stress tests for rapid typing and paste operations.

Risks and Mitigations
- Block boundary correctness: expand safe margins and add tests; if mismatch detected, fall back to 'full' hint for region.
- ID stability: use hash + proximity; if ambiguous, regenerate id and notify removed/added to prevent mispatch.
- Memory: add LRU for heavy render artifacts (future); PieceTable add buffer growth management.
- Mermaid: keep main thread rendering with lazy/intersection; Worker only returns placeholder HTML.

Mapping to Step 5 Requirements
- Patch format: {seq, docVersion, changes[], hint} defined above; include transferable ArrayBuffer for inserted content.
- Batch merge: use 50–150ms debounce window in hook.
- Mirror data structure: PieceTable to avoid O(n) concatenations; keep consistent with CodeMirror history.
- Consistency with CodeMirror history: docVersion increments in lockstep with CM transactions; redo/undo integrates via patch.

Ready for Implementation
- All interfaces and responsibilities defined.
- Next: codex implements Worker-side PieceTable + patch handlers, hook, Editor wiring, VirtualPreview integration, and tests.
