import { useEffect, type ReactNode } from 'react';

interface InfoModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional wider dialog (score tables) */
  wide?: boolean;
  footerNote?: string;
}

/**
 * Full-screen dimmed backdrop + centered dialog.
 * Escape / backdrop click / Lukk closes; locks body scroll while open.
 */
export function InfoModal({
  open,
  title,
  onClose,
  children,
  wide = false,
  footerNote,
}: InfoModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleId = `info-modal-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal-dialog ${wide ? 'modal-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </button>
        </header>

        <div className="modal-body">{children}</div>

        <footer className="modal-footer">
          {footerNote ? <p className="muted small">{footerNote}</p> : <span />}
          <button type="button" className="btn primary" onClick={onClose}>
            Lukk
          </button>
        </footer>
      </div>
    </div>
  );
}
