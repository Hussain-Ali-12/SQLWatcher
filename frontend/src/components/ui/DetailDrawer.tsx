import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './DetailDrawer.module.css';

export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute('hidden'));
}

export function DetailDrawer({ open, onClose, title, subtitle, width = 480, children }: DetailDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = getFocusable(drawer);
      (focusable[0] ?? drawer).focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [onClose, open]);

  function onTrapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = getFocusable(drawer);
    if (focusable.length === 0) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return createPortal(
    <div className={styles.layer}>
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Close drawer backdrop" />
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
        tabIndex={-1}
        style={{ '--drawer-width': `${width}px` } as React.CSSProperties}
        onKeyDown={onTrapFocus}
      >
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id="detail-drawer-title" className={styles.title}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close drawer">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
