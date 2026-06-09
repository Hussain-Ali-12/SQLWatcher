import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { sql } from '@codemirror/lang-sql';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import styles from './SqlEditor.module.css';

export interface SqlEditorHandle {
  focus: () => void;
}

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

const editableCompartment = new Compartment();

const tokenTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg-raised)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    minHeight: 'var(--sql-editor-min-height)',
  },
  '.cm-content': {
    padding: '14px',
    caretColor: 'var(--accent2)',
    minHeight: 'var(--sql-editor-min-height)',
  },
  '.cm-line': {
    lineHeight: '1.55',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-raised)',
    color: 'var(--text-dim)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 35%, transparent)',
  },
  '.cm-placeholder': {
    color: 'var(--text-dim)',
  },
  '&.cm-focused': {
    outline: '2px solid var(--accent)',
    outlineOffset: '-2px',
  },
});

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, onChange, onSubmit, placeholder, minHeight = 120, disabled = false },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const extensions = [
      sql(),
      tokenTheme,
      placeholder ? placeholderExtension(placeholder) : [],
      editableCompartment.of(EditorView.editable.of(!disabled)),
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            onSubmitRef.current?.();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

  return (
    <div
      ref={hostRef}
      className={`${styles.editorShell} ${disabled ? styles.disabled : ''}`}
      style={{ '--sql-editor-min-height': `${minHeight}px` } as React.CSSProperties}
    />
  );
});
