import type { GeneratorSettings } from '../catan/types';

interface SettingsPanelProps {
  settings: GeneratorSettings;
  onChange: (settings: GeneratorSettings) => void;
}

const SETTING_LABELS: {
  key: keyof GeneratorSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'noAdjacent6And8',
    label: '6 og 8 kan ikke være naboer',
    description: 'Standard Catan-regel: tallbrikkene 6 og 8 skal ikke ligge ved siden av hverandre',
  },
  {
    key: 'noAdjacent2And12',
    label: '2 og 12 kan ikke være naboer',
    description: 'Tallbrikkene 2 og 12 skal ikke ligge ved siden av hverandre',
  },
  {
    key: 'noAdjacentSameResource',
    label: 'Like ressurser kan ikke være naboer',
    description: 'To like ressursbrikker skal ikke ligge ved siden av hverandre',
  },
  {
    key: 'noAdjacentSameNumber',
    label: 'Like tall kan ikke være naboer',
    description: 'To like tallbrikker skal ikke ligge ved siden av hverandre',
  },
];

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="panel settings-panel">
      <h2>Genereringsregler</h2>
      <p className="muted small">Avkrysset = regelen er aktiv</p>
      <div className="settings-list">
        {SETTING_LABELS.map(({ key, label, description }) => (
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
    </div>
  );
}
