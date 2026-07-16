import type { BoardSize, GeneratorSettings } from '../catan/types';

interface SettingsPanelProps {
  settings: GeneratorSettings;
  onChange: (settings: GeneratorSettings) => void;
  /** In modal – uten panel-wrapper */
  embedded?: boolean;
  /** Styrer om bonanza-valget vises (kun grunnspill) */
  boardSize?: BoardSize;
}

const SETTING_LABELS: {
  key: keyof GeneratorSettings;
  label: string;
  description: string;
  /** Hvis satt, vises innstillingen bare for denne brettstørrelsen */
  onlyBoardSize?: BoardSize;
}[] = [
  {
    key: 'allowAdjacent6And8',
    label: '6 og 8 kan være naboer',
    description: 'Tillater at tallbrikkene 6 og 8 ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacent2And12',
    label: '2 og 12 kan være naboer',
    description: 'Tillater at tallbrikkene 2 og 12 ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacentSameResource',
    label: 'Like ressurser kan være naboer',
    description: 'Tillater at to like ressursbrikker ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacentSameNumber',
    label: 'Like tall kan være naboer',
    description: 'Tillater at to like tallbrikker ligger ved siden av hverandre',
  },
  {
    key: 'randomHarbors',
    label: 'Tilfeldige havner',
    description:
      'Blander rekkefølgen på kantbrikkene (B1–B6). Hver brikke beholder sin relative havnplassering. Av = original rekkefølge.',
  },
  {
    key: 'bonanzaBoard',
    label: 'Bonanzabrett',
    description:
      'Trekker 19 av 30 ressursbrikker og tall fra samlet pool (18 grunn + 10 utvidelse = 28). Kan gi to ørkener, mange av én type — eller ingen.',
    onlyBoardSize: 'base',
  },
];

export function SettingsPanel({
  settings,
  onChange,
  embedded = false,
  boardSize = 'base',
}: SettingsPanelProps) {
  const visibleSettings = SETTING_LABELS.filter(
    (row) => !row.onlyBoardSize || row.onlyBoardSize === boardSize
  );

  const inner = (
    <>
      {embedded ? <h3>Genereringsregler</h3> : <h2>Genereringsregler</h2>}
      <p className="muted small">Avkrysset = tillatt / aktiv</p>
      <div className="settings-list">
        {visibleSettings.map(({ key, label, description }) => (
          <label key={key} className="setting-row">
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(e) =>
                onChange({ ...settings, [key]: e.target.checked })
              }
            />
            <span className="setting-text">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </div>
    </>
  );

  if (embedded) {
    return <section className="modal-section settings-panel-embedded">{inner}</section>;
  }

  return <div className="panel settings-panel">{inner}</div>;
}
