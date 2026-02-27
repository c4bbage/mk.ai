/**
 * BDD tests for editor store
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editor';

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useEditorStore.getState().reset();
  });

  it('has default content', () => {
    const { content } = useEditorStore.getState();
    expect(content).toContain('MD.AI');
  });

  it('sets content and marks as modified', () => {
    useEditorStore.getState().setContent('# New content');
    const { content, isModified } = useEditorStore.getState();
    expect(content).toBe('# New content');
    expect(isModified).toBe(true);
  });

  it('has default fileName', () => {
    expect(useEditorStore.getState().fileName).toBe('untitled.md');
  });

  it('sets fileName', () => {
    useEditorStore.getState().setFileName('test.md');
    expect(useEditorStore.getState().fileName).toBe('test.md');
  });

  it('has undefined filePath by default', () => {
    expect(useEditorStore.getState().filePath).toBeUndefined();
  });

  it('sets filePath', () => {
    useEditorStore.getState().setFilePath('/Users/test/doc.md');
    expect(useEditorStore.getState().filePath).toBe('/Users/test/doc.md');
  });

  it('sets isModified', () => {
    useEditorStore.getState().setIsModified(true);
    expect(useEditorStore.getState().isModified).toBe(true);
    useEditorStore.getState().setIsModified(false);
    expect(useEditorStore.getState().isModified).toBe(false);
  });

  it('has default theme', () => {
    expect(useEditorStore.getState().theme).toBe('github');
  });

  it('sets theme', () => {
    useEditorStore.getState().setTheme('wechat-green');
    expect(useEditorStore.getState().theme).toBe('wechat-green');
  });

  it('has default fontSize', () => {
    expect(useEditorStore.getState().fontSize).toBe(16);
  });

  it('sets fontSize', () => {
    useEditorStore.getState().setFontSize(20);
    expect(useEditorStore.getState().fontSize).toBe(20);
  });

  it('has default imageStorage', () => {
    expect(useEditorStore.getState().imageStorage).toBe('assets');
  });

  it('sets imageStorage', () => {
    useEditorStore.getState().setImageStorage('base64');
    expect(useEditorStore.getState().imageStorage).toBe('base64');
  });

  it('has autoSave enabled by default', () => {
    expect(useEditorStore.getState().autoSave).toBe(true);
  });

  it('toggles autoSave', () => {
    useEditorStore.getState().setAutoSave(false);
    expect(useEditorStore.getState().autoSave).toBe(false);
  });

  it('has default autoSaveDelay', () => {
    expect(useEditorStore.getState().autoSaveDelay).toBe(2000);
  });

  it('toggles editor visibility', () => {
    const initial = useEditorStore.getState().showEditor;
    useEditorStore.getState().toggleEditor();
    expect(useEditorStore.getState().showEditor).toBe(!initial);
    useEditorStore.getState().toggleEditor();
    expect(useEditorStore.getState().showEditor).toBe(initial);
  });

  it('toggles preview visibility', () => {
    const initial = useEditorStore.getState().showPreview;
    useEditorStore.getState().togglePreview();
    expect(useEditorStore.getState().showPreview).toBe(!initial);
  });

  it('toggles outline visibility', () => {
    expect(useEditorStore.getState().showOutline).toBe(false);
    useEditorStore.getState().toggleOutline();
    expect(useEditorStore.getState().showOutline).toBe(true);
  });

  it('toggles fileTree visibility', () => {
    expect(useEditorStore.getState().showFileTree).toBe(false);
    useEditorStore.getState().toggleFileTree();
    expect(useEditorStore.getState().showFileTree).toBe(true);
  });

  it('resets to initial state', () => {
    useEditorStore.getState().setContent('modified');
    useEditorStore.getState().setFileName('test.md');
    useEditorStore.getState().setFilePath('/test');
    useEditorStore.getState().setIsModified(true);

    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.fileName).toBe('untitled.md');
    expect(state.filePath).toBeUndefined();
    expect(state.isModified).toBe(false);
    expect(state.content).toContain('MD.AI');
  });
});
