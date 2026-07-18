import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  applyRecognitionToDraft,
  axialToImagePixel,
  defaultImageAdjust,
  defaultOverlayTransform,
  loadImageDataFromUrl,
  nudgeImageAdjust,
  recognizeBoardFromImageData,
  scaleImageAdjustForRecognition,
  scaleTransformForRecognition,
  type ImageAdjust,
  type ImageOverlayTransform,
} from '../catan/photoRecognize';
import { getLandHexCoords } from '../catan/boardLayout';
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
  return (
    Array.from({ length: 6 }, (_, i) => {
      const { x, y } = hexCorner(coord, i, size);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z'
  );
}

/** object-fit: contain / SVG meet-skala fra naturlig bilde → ramme. */
function meetScale(
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number
): number {
  if (frameW <= 0 || frameH <= 0 || imageW <= 0 || imageH <= 0) return 1;
  return Math.min(frameW / imageW, frameH / imageH);
}

export function PhotoBoardModal({
  open,
  onClose,
  boardSize,
  settings,
  onApply,
}: PhotoBoardModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
    null
  );
  /** Fast hex-overlay — flyttes ikke; bildet justeres under. */
  const [gridTransform, setGridTransform] =
    useState<ImageOverlayTransform | null>(null);
  const [imageAdjust, setImageAdjust] = useState<ImageAdjust>(defaultImageAdjust);
  const [drafts, setDrafts] = useState<LandHexDraft[]>(() =>
    createEmptyLandDraft(boardSize)
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [recognizeStatus, setRecognizeStatus] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null
  );

  const landCoords = useMemo(() => getLandHexCoords(boardSize), [boardSize]);

  useEffect(() => {
    if (!open) return;
    setDrafts(createEmptyLandDraft(boardSize));
    setSelectedKey(null);
    setApplyError(null);
    setRecognizeStatus(null);
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

  useEffect(() => {
    if (!imageUrl || !overlayRef.current) {
      setFrameSize(null);
      return;
    }
    const el = overlayRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setFrameSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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

  const cssScale =
    frameSize && imageSize
      ? meetScale(frameSize.w, frameSize.h, imageSize.w, imageSize.h)
      : 1;

  const imageLayerStyle = useMemo(
    () => ({
      transform: `translate(${imageAdjust.panX * cssScale}px, ${
        imageAdjust.panY * cssScale
      }px) rotate(${imageAdjust.rotationDeg}deg) scale(${imageAdjust.zoom})`,
    }),
    [imageAdjust, cssScale]
  );

  const initForImage = useCallback(
    (w: number, h: number) => {
      setImageSize({ w, h });
      setGridTransform(defaultOverlayTransform(w, h, landCoords));
      setImageAdjust(defaultImageAdjust());
    },
    [landCoords]
  );

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setRecognizeStatus(null);
    const img = new Image();
    img.onload = () => {
      initForImage(img.naturalWidth || img.width, img.naturalHeight || img.height);
    };
    img.src = url;
  };

  const updateSelected = (patch: Partial<Pick<LandHexDraft, 'resource' | 'number'>>) => {
    if (!selectedKey) return;
    setDrafts((prev) =>
      prev.map((d) => {
        if (landDraftKey(d) !== selectedKey) return d;
        const next: LandHexDraft = { ...d, ...patch };
        if (next.resource === 'desert') {
          next.number = null;
        } else if (patch.resource && d.resource === 'desert') {
          next.number = null;
        }
        return next;
      })
    );
    setApplyError(null);
  };

  const handleRecognize = async () => {
    if (!imageUrl || !gridTransform) {
      setRecognizeStatus('Last opp bilde og juster det under hex-nettet først.');
      return;
    }
    setRecognizing(true);
    setRecognizeStatus(null);
    setApplyError(null);
    try {
      const { imageData, scale } = await loadImageDataFromUrl(imageUrl);
      const recogTransform = scaleTransformForRecognition(gridTransform, scale);
      const recogAdjust = scaleImageAdjustForRecognition(imageAdjust, scale);
      const result = recognizeBoardFromImageData(
        imageData,
        recogTransform,
        boardSize,
        recogAdjust
      );
      setDrafts((prev) =>
        applyRecognitionToDraft(prev, result, {
          overwriteResources: true,
          overwriteNumbers: true,
        })
      );
      setRecognizeStatus(
        `Gjenkjente ${result.recognizedResources}/${result.hexes.length} ressurser og ` +
          `${result.recognizedNumbers}/${result.hexes.length} tall. ` +
          'Sjekk at bildet treffer hex-nettet og rett feil i gridet før du bruker brettet.'
      );
    } catch (err) {
      setRecognizeStatus(
        err instanceof Error ? err.message : 'Gjenkjenning feilet.'
      );
    } finally {
      setRecognizing(false);
    }
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
    setRecognizeStatus(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageUrl) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: imageAdjust.panX,
      panY: imageAdjust.panY,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !imageSize || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = meetScale(rect.width, rect.height, imageSize.w, imageSize.h);
    const dx = (e.clientX - dragRef.current.x) / scale;
    const dy = (e.clientY - dragRef.current.y) / scale;
    const nextPanX = dragRef.current.panX + dx;
    const nextPanY = dragRef.current.panY + dy;
    setImageAdjust((prev) =>
      nudgeImageAdjust(prev, { panX: nextPanX, panY: nextPanY })
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!open) return null;

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
            Last opp et bilde mest mulig rett ovenfra. Hex-nettet ligger fast —
            dra, skaler og roter bildet til brikkene treffer. Tallbrikkene ligger
            oppå ressursene (ørken har ingen tallbrikke). Kjør gjenkjenning, og
            rett feil i gridet før du bruker brettet.
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
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleRecognize}
                  disabled={!imageUrl || !gridTransform || recognizing}
                >
                  {recognizing ? 'Gjenkjenner…' : 'Gjenkjenn brett'}
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (imageUrl) URL.revokeObjectURL(imageUrl);
                      setImageUrl(null);
                      setImageSize(null);
                      setGridTransform(null);
                      setImageAdjust(defaultImageAdjust());
                      setRecognizeStatus(null);
                    }}
                  >
                    Fjern bilde
                  </button>
                )}
              </div>

              <div
                ref={overlayRef}
                className={`photo-board-ref-frame photo-overlay-frame ${
                  imageUrl ? 'has-image' : ''
                }`}
                onPointerDown={imageUrl ? onPointerDown : undefined}
                onPointerMove={imageUrl ? onPointerMove : undefined}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                {imageUrl && gridTransform && imageSize ? (
                  <>
                    <div className="photo-image-layer" style={imageLayerStyle}>
                      <img
                        src={imageUrl}
                        alt="Opplastet Catan-brett"
                        draggable={false}
                      />
                    </div>
                    <svg
                      className="photo-overlay-svg"
                      viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {landCoords.map((coord) => {
                        const center = axialToImagePixel(coord, gridTransform);
                        const rad = (gridTransform.rotationDeg * Math.PI) / 180;
                        const pts = Array.from({ length: 6 }, (_, i) => {
                          const angle = ((60 * i - 30) * Math.PI) / 180 + rad;
                          return {
                            x: center.x + gridTransform.hexSize * Math.cos(angle),
                            y: center.y + gridTransform.hexSize * Math.sin(angle),
                          };
                        });
                        const d =
                          pts
                            .map(
                              (p, i) =>
                                `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
                            )
                            .join(' ') + ' Z';
                        return (
                          <g key={`${coord.q},${coord.r}`}>
                            <path
                              d={d}
                              className="photo-overlay-hex"
                              fill="rgba(220, 38, 38, 0.1)"
                              stroke="rgba(220, 38, 38, 0.95)"
                              strokeWidth={Math.max(
                                2,
                                gridTransform.hexSize * 0.045
                              )}
                            />
                            <circle
                              cx={center.x}
                              cy={center.y}
                              r={Math.max(2.5, gridTransform.hexSize * 0.065)}
                              fill="rgba(255, 255, 255, 0.9)"
                              stroke="rgba(185, 28, 28, 0.95)"
                              strokeWidth={Math.max(
                                1.2,
                                gridTransform.hexSize * 0.025
                              )}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </>
                ) : (
                  <p className="muted small">
                    Last opp et bilde tatt mest mulig rett ovenfra. Dra for å
                    flytte bildet, bruk skyverne under for skalering og
                    rotasjon.
                  </p>
                )}
              </div>

              {gridTransform && imageUrl && (
                <div className="photo-overlay-controls">
                  <label className="photo-overlay-slider">
                    <span>Skalér bilde</span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.01}
                      value={imageAdjust.zoom}
                      onChange={(e) =>
                        setImageAdjust(
                          nudgeImageAdjust(imageAdjust, {
                            zoom: Number(e.target.value),
                          })
                        )
                      }
                    />
                  </label>
                  <label className="photo-overlay-slider">
                    <span>Roter bilde</span>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={0.5}
                      value={imageAdjust.rotationDeg}
                      onChange={(e) =>
                        setImageAdjust(
                          nudgeImageAdjust(imageAdjust, {
                            rotationDeg: Number(e.target.value),
                          })
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setImageAdjust(defaultImageAdjust())}
                  >
                    Nullstill bilde
                  </button>
                </div>
              )}

              {recognizeStatus && (
                <p className="photo-recognize-status muted small">{recognizeStatus}</p>
              )}
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
                        stroke={
                          active ? '#1a5f4a' : complete ? '#2d6a4f' : '#8a8174'
                        }
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
                          color:
                            resource === 'wheat' || resource === 'sheep'
                              ? '#1a1a1a'
                              : '#fff',
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
                        disabled={
                          !selected ||
                          selected.resource === 'desert' ||
                          !selected.resource
                        }
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
                  Avvik fra standardsett:{' '}
                  {validation.warnings.slice(0, 4).join(' · ')}
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
