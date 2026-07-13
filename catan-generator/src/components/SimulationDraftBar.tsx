import type { SimulationState } from '../catan/simulator';
import { currentPlayer } from '../catan/simulator';
import { getPlayerConfig } from '../catan/playerConfig';

interface SimulationDraftBarProps {
  state: SimulationState;
}

export function SimulationDraftBar({ state }: SimulationDraftBarProps) {
  const { placementOrder, currentStep, finished, config } = state;
  const activePlayer = currentPlayer(state);

  return (
    <div className="sim-draft-bar">
      <div className="sim-draft-bar-header">
        <strong>Draft</strong>
        <span className="muted small">
          {finished
            ? 'Ferdig'
            : `Trekk ${Math.min(currentStep + 1, placementOrder.length)} / ${placementOrder.length}`}
        </span>
      </div>
      <div className="sim-draft-steps">
        {placementOrder.map((playerIndex, step) => {
          const player = getPlayerConfig(config, playerIndex);
          const isHuman = playerIndex === config.humanPlayerIndex;
          const isDone = step < currentStep;
          const isActive = !finished && step === currentStep;
          const isFuture = step > currentStep;

          return (
            <div
              key={`${step}-${playerIndex}`}
              className={[
                'sim-draft-step',
                isDone ? 'done' : '',
                isActive ? 'active' : '',
                isFuture ? 'future' : '',
                isHuman ? 'human' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={`${player.name}${isHuman ? ' (deg)' : ''}`}
            >
              <span
                className="sim-draft-step-dot"
                style={{ background: player.color, opacity: isFuture ? 0.45 : 1 }}
              />
              <span className="sim-draft-step-num">{step + 1}</span>
              {isActive && activePlayer === playerIndex && (
                <span className="sim-draft-step-pulse" style={{ borderColor: player.color }} />
              )}
            </div>
          );
        })}
      </div>
      {!finished && activePlayer !== null && (
        <p className="sim-draft-turn muted small">
          {activePlayer === config.humanPlayerIndex ? (
            <>
              <span style={{ color: getPlayerConfig(config, activePlayer).color }}>●</span>{' '}
              Din tur — velg plassering
            </>
          ) : (
            <>
              <span style={{ color: getPlayerConfig(config, activePlayer).color }}>●</span>{' '}
              {getPlayerConfig(config, activePlayer).name} plasserer…
            </>
          )}
        </p>
      )}
    </div>
  );
}
