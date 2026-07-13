import type { PlayerCount } from '../catan/types';
import type { SimulationConfig } from '../catan/playerConfig';
import {
  PLAYER_COLOR_PRESETS,
  createSimulationConfig,
  defaultPlayerName,
} from '../catan/playerConfig';
import { getPlacementOrder } from '../catan/simulator';

interface PlayerSetupPanelProps {
  playerCount: PlayerCount;
  config: SimulationConfig;
  disabled?: boolean;
  onConfigChange: (config: SimulationConfig) => void;
}

export function PlayerSetupPanel({
  playerCount,
  config,
  disabled,
  onConfigChange,
}: PlayerSetupPanelProps) {
  const order = getPlacementOrder(playerCount);

  const updatePlayer = (index: number, patch: Partial<{ name: string; color: string }>) => {
    const players = config.players.map((p, i) =>
      i === index ? { ...p, ...patch } : p
    );
    onConfigChange({ ...config, players });
  };

  const setHuman = (humanPlayerIndex: number) => {
    onConfigChange({ ...config, humanPlayerIndex });
  };

  return (
    <div className="player-setup">
      <h3 className="player-setup-title">Spillere</h3>
      <p className="muted small player-setup-lead">
        Velg hvem du er (for strategianbefaling). Alle spillere plasseres manuelt i draft-rekkefølge.
      </p>

      <div className="player-setup-grid">
        {config.players.slice(0, playerCount).map((player, index) => {
          const isHuman = config.humanPlayerIndex === index;
          return (
            <div
              key={index}
              className={`player-setup-card ${isHuman ? 'is-human' : ''}`}
              style={{ borderColor: isHuman ? player.color : undefined }}
            >
              <label className="player-human-radio">
                <input
                  type="radio"
                  name="human-player"
                  checked={isHuman}
                  disabled={disabled}
                  onChange={() => setHuman(index)}
                />
                <span className="player-human-badge" style={{ background: player.color }}>
                  {isHuman ? 'Deg' : index + 1}
                </span>
              </label>

              <label className="field player-name-field">
                Navn
                <input
                  type="text"
                  value={player.name}
                  disabled={disabled}
                  maxLength={24}
                  placeholder={defaultPlayerName(index)}
                  onChange={(e) => updatePlayer(index, { name: e.target.value })}
                />
              </label>

              <div className="player-color-field">
                <span className="field-label">Farge</span>
                <div className="player-color-row">
                  <input
                    type="color"
                    className="player-color-input"
                    value={player.color}
                    disabled={disabled}
                    onChange={(e) => updatePlayer(index, { color: e.target.value })}
                    aria-label={`Farge for ${player.name}`}
                  />
                  <div className="player-color-presets">
                    {PLAYER_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${player.color === color ? 'active' : ''}`}
                        style={{ background: color }}
                        disabled={disabled}
                        aria-label={`Velg farge ${color}`}
                        onClick={() => updatePlayer(index, { color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="draft-order-visual" aria-label="Draft-rekkefølge">
        <span className="draft-order-visual-label">Draft</span>
        <div className="draft-order-track">
          {order.map((playerIndex, step) => {
            const p = config.players[playerIndex];
            const isHuman = playerIndex === config.humanPlayerIndex;
            return (
              <div
                key={`${step}-${playerIndex}`}
                className={`draft-order-chip ${isHuman ? 'is-human' : ''}`}
                title={`Trekk ${step + 1}: ${p?.name ?? defaultPlayerName(playerIndex)}`}
              >
                <span className="draft-order-dot" style={{ background: p?.color }} />
                <span className="draft-order-step">{step + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function syncConfigPlayerCount(
  config: SimulationConfig,
  playerCount: PlayerCount
): SimulationConfig {
  const players = createSimulationConfig(playerCount, config.humanPlayerIndex).players.map(
    (fresh, i) => ({
      name: config.players[i]?.name || fresh.name,
      color: config.players[i]?.color || fresh.color,
    })
  );
  const humanPlayerIndex = Math.min(config.humanPlayerIndex, playerCount - 1);
  return { players, humanPlayerIndex };
}
