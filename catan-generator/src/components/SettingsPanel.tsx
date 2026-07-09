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
    key: 'allowAdjacent6And8',
    label: '6 og 8 kan være naboer',
    description: 'Tillat at tallbrikkene 6 og 8 ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacent2And12',
    label: '2 og 12 kan være naboer',
    description: 'Tillat at tallbrikkene 2 og 12 ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacentSameResource',
    label: 'Like ressurser kan være naboer',
    description: 'Tillat at to like ressursbrikker ligger ved siden av hverandre',
  },
  {
    key: 'allowAdjacentSameNumber',
    label: 'Like tall kan være naboer',
    description: 'Tillat at to like tallbrikker ligger ved siden av hverandre',
  },
];

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="panel settings-panel">
      <h2>Genereringsregler</h2>
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
