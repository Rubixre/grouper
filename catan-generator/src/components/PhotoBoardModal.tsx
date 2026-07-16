import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, BoardSize, GeneratorSettings, ResourceType } from '../catan/types';
import {
  PHOTO_BOARD_NUMBERS,
  buildBoardFromLandDraft,
  createEmptyLandDraft,
  isLandHexComplete,
  landDraftKey,
  validateLandDraft,
  type LandHexDraft,
} from '../catan/boardFromPhoto';
import { hexCorner, hexToPixel } from '../catan/hex';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../catan/playerStats';

interface PhotoBoardModalProps {
  open: boolean;
  onClose: () => void;
  boardSize: BoardSize;
  settings: GeneratorSettings;
  onApply: (board: Board) => void;
}

const RESOURCE_OPTIONS: ResourceType[] = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'desert',
];

const DESERT_COLOR = '#c2b280';
const EMPTY_COLOR = '#e8e4dc';

function resourceFill(resource: ResourceType | null): string {
  if (!resource) return EMPTY_COLOR;
  if (resource === 'desert') return DESERT_COLOR;
  return RESOURCE_COLORS[resource];
}

function resourceLabel(resource: ResourceType | null): string {
  if (!resource) return '—';
  if (resource === 'desert') return 'Ørken';
  return RESOURCE_LABELS[resource];
}

function hexPath(coord: { q: number; r: number }, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const { x, y } = hexCorner(coord, i, size);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

export function PhotoBoardModal({
  open,
  onClose,
  boardSize,
  settings,
  onApply,
}: PhotoBoardModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<LandHexDraft[]>(() =>
    createEmptyLandDraft(boardSize)
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts(createEmptyLandDraft(boardSize));
    setSelectedKey(null);
    setApplyError(null);
  }, [open, boardSize]);

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

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const validation = useMemo(
    () => validateLandDraft(drafts, boardSize),
    [drafts, boardSize]
  );

  const selected = drafts.find((d) => landDraftKey(d) === selectedKey) ?? null;

  const { viewBox, hexSize } = useMemo(() => {
    const size = 28;
    const centers = drafts.map((d) => hexToPixel(d.coord, size));
    const pad = size * 1.2;
    const xs = centers.map((c) => c.x);
    const ys = centers.map((c) => c.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return {
      hexSize: size,
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    };
  }, [drafts]);

  if (!open) return null;

  const updateSelected = (patch: Partial<Pick<LandHexDraft, 'resource' | 'number'>>) => {
    if (!selectedKey) return;
    setDrafts((prev) =>
      prev.map((d) => {
        if (landDraftKey(d) !== selectedKey) return d;
        const next: LandHexDraft = { ...d, ...patch };
        if (next.resource === 'desert') {
          next.number = null;
        } else if (patch.resource && d.resource === 'desert') {
          // Byttet bort fra ørken — tall må velges på nytt
          next.number = null;
        }
        return next;
      })
    );
    setApplyError(null);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
  };

  const handleApply = () => {
    const result = buildBoardFromLandDraft(drafts, settings, boardSize);
    if (!result.ok) {
      setApplyError(result.error);
      return;
    }
    onApply(result.board);
    onClose();
  };

  const clearDraft = () => {
    setDrafts(createEmptyLandDraft(boardSize));
    setSelectedKey(null);
    setApplyError(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-dialog photo-board-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-board-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="photo-board-title">Brett fra bilde</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </button>
        </header>

        <div className="modal-body photo-board-body">
          <p className="muted small photo-board-intro">
            Last opp et bilde av brettet og fyll inn ressurs + tall for hver
            landhex. Havner settes automatisk (som ved generering). Første
            versjon er halvautomatisk — du retter/fyller gridet selv.
          </p>

          <div className="photo-board-layout">
            <section className="photo-board-ref">
              <div className="photo-board-ref-toolbar">
                <button
                  type="button"
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imageUrl ? 'Bytt bilde' : 'Last opp bilde'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="photo-board-file"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {imageUrl && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (imageUrl) URL.revokeObjectURL(imageUrl);
                      setImageUrl(null);
                    }}
                  >
                    Fjern bilde
                  </button>
                )}
              </div>
              <div className="photo-board-ref-frame">
                {imageUrl ? (
                  <img src={imageUrl} alt="Opplastet Catan-brett" />
                ) : (
                  <p className="muted small">
                    Ingen bilde ennå — valgfritt, men nyttig som referanse mens
                    du fyller hexene.
                  </p>
                )}
              </div>
            </section>

            <section className="photo-board-editor">
              <div className="photo-board-progress">
                <strong>
                  {validation.filledCount}/{validation.totalCount} hex
                </strong>
                <span className="muted small">
                  {boardSize === 'base' ? 'Grunnspill' : 'Utvidelse'} · klikk hex,
                  velg ressurs/tall
                </span>
              </div>

              <svg
                className="photo-board-hex-svg"
                viewBox={viewBox}
                role="img"
                aria-label="Landhex-redigering"
              >
                {drafts.map((draft) => {
                  const key = landDraftKey(draft);
                  const center = hexToPixel(draft.coord, hexSize);
                  const active = key === selectedKey;
                  const complete = isLandHexComplete(draft);
                  return (
                    <g
                      key={key}
                      className={`photo-hex ${active ? 'active' : ''} ${
                        complete ? 'complete' : ''
                      }`}
                      onClick={() => setSelectedKey(key)}
                      style={{ cursor: 'pointer' }}
                    >
                      <path
                        d={hexPath(draft.coord, hexSize)}
                        fill={resourceFill(draft.resource)}
                        stroke={active ? '#1a5f4a' : complete ? '#2d6a4f' : '#8a8174'}
                        strokeWidth={active ? 3.2 : 1.4}
                      />
                      <text
                        x={center.x}
                        y={center.y + (draft.number != null ? -4 : 3)}
                        textAnchor="middle"
                        className="photo-hex-label"
                      >
                        {draft.resource === 'desert'
                          ? 'Ø'
                          : draft.resource
                            ? RESOURCE_LABELS[draft.resource].slice(0, 1)
                            : '·'}
                      </text>
                      {draft.number != null && (
                        <text
                          x={center.x}
                          y={center.y + 10}
                          textAnchor="middle"
                          className="photo-hex-number"
                        >
                          {draft.number}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="photo-board-palette">
                <div className="photo-board-palette-row">
                  <span className="photo-board-palette-label">
                    Ressurs
                    {selected
                      ? ` · ${resourceLabel(selected.resource)}`
                      : ' · velg hex'}
                  </span>
                  <div className="photo-board-chips">
                    {RESOURCE_OPTIONS.map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        className={`photo-chip ${
                          selected?.resource === resource ? 'active' : ''
                        }`}
                        style={{
                          background: resourceFill(resource),
                          color: resource === 'wheat' || resource === 'sheep' ? '#1a1a1a' : '#fff',
                        }}
                        disabled={!selected}
                        onClick={() => updateSelected({ resource })}
                      >
                        {resourceLabel(resource)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="photo-board-palette-row">
                  <span className="photo-board-palette-label">Tall</span>
                  <div className="photo-board-chips">
                    {PHOTO_BOARD_NUMBERS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`photo-chip number ${
                          selected?.number === n ? 'active' : ''
                        }`}
                        disabled={!selected || selected.resource === 'desert' || !selected.resource}
                        onClick={() => updateSelected({ number: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {validation.warnings.length > 0 && (
                <p className="photo-board-warning muted small">
                  Avvik fra standardsett: {validation.warnings.slice(0, 4).join(' · ')}
                  {validation.warnings.length > 4 ? ' …' : ''}
                </p>
              )}
              {applyError && <p className="photo-board-error">{applyError}</p>}
            </section>
          </div>
        </div>

        <footer className="modal-footer photo-board-footer">
          <button type="button" className="btn" onClick={clearDraft}>
            Tøm grid
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleApply}
            disabled={!validation.complete}
          >
            Bruk brett
          </button>
        </footer>
      </div>
    </div>
  );
}
