import { useEffect } from 'react';
import type { BoardSize, GeneratorSettings } from '../catan/types';
import { BOARD_SIZE_CONFIG } from '../catan/boardLayout';
import { SettingsPanel } from './SettingsPanel';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: GeneratorSettings;
  onSettingsChange: (settings: GeneratorSettings) => void;
  boardSize: BoardSize;
  onBoardSizeChange: (size: BoardSize) => void;
}

export function SettingsModal({
  open,
  onClose,
  settings,
  onSettingsChange,
  boardSize,
  onBoardSizeChange,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="settings-modal-title">Innstillinger</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Brettstørrelse</h3>
            <label className="field">
              Variant
              <select
                value={boardSize}
                onChange={(e) => onBoardSizeChange(e.target.value as BoardSize)}
              >
                {(Object.keys(BOARD_SIZE_CONFIG) as BoardSize[]).map((key) => (
                  <option key={key} value={key}>
                    {BOARD_SIZE_CONFIG[key].label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              Utvidelse legger til 11 landhexer og 4 enkelt-hex kantbrikker (B7–B10).
              Bonanzabrett er bare tilgjengelig for grunnspill.
            </p>
          </section>

          <SettingsPanel
            embedded
            boardSize={boardSize}
            settings={settings}
            onChange={onSettingsChange}
          />
        </div>

        <footer className="modal-footer">
          <p className="muted small">
            Endringer gjelder neste gang du genererer et nytt brett.
          </p>
          <button type="button" className="btn primary" onClick={onClose}>
            Lukk
          </button>
        </footer>
      </div>
    </div>
  );
}
