import type { Board, ResourceWeights } from '../catan/types';
import type { SettlementScore } from '../catan/types';
import { explainPlacementScore } from '../catan/settlements';
import type { StrategyProfile } from '../catan/resourceWeights';
import { RESOURCE_LABELS } from '../catan/playerStats';
import type { ProdResource } from '../catan/playerStats';

interface PlacementScoreBreakdownProps {
  score: SettlementScore;
  board: Board;
  rank: number;
  strategyProfile: StrategyProfile;
  strategyWeights: ResourceWeights;
  firstVertexId?: string;
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

function pct(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

function BonusLine({ label, value, negative }: { label: string; value?: number; negative?: boolean }) {
  if (value === undefined || value === 0) return null;
  return (
    <li>
      <span>{label}</span>
      <strong>
        {negative ? '−' : '+'}
        {fmt(value)}
      </strong>
    </li>
  );
}

export function PlacementScoreBreakdown({
  score,
  board,
  rank,
  strategyProfile,
  strategyWeights,
  firstVertexId,
}: PlacementScoreBreakdownProps) {
  const explanation = explainPlacementScore(score, board, firstVertexId, strategyWeights);

  return (
    <div className="score-breakdown">
      <h3>Poengforklaring · plassering #{rank}</h3>
      <p className="score-breakdown-profile muted small">
        Strategi: {strategyProfile.label}
      </p>
      <p className="score-breakdown-formula muted small">
        {explanation.kind === 'first' ? (
          <>Total = prod. + dekning + pip + havn − straff</>
        ) : (
          <>Total = par prod. + synergi + utfylling − overlapp + dekning + havn</>
        )}
      </p>

      <table className="score-hex-table">
        <thead>
          <tr>
            <th>Hex</th>
            <th>Sannsynl.</th>
            <th>Vekt</th>
            <th>Poeng</th>
          </tr>
        </thead>
        <tbody>
          {explanation.hexContributions.map((row, i) => (
            <tr key={i}>
              <td>
                {RESOURCE_LABELS[row.resource as ProdResource]} {row.number}
              </td>
              <td>{pct(row.probability)}</td>
              <td>×{fmt(row.resourceWeight, 2)}</td>
              <td>{fmt(row.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {explanation.kind === 'second' && explanation.firstProduction !== undefined && (
            <tr>
              <td colSpan={3}>1. landsby (vektet prod.)</td>
              <td>{fmt(explanation.firstProduction)}</td>
            </tr>
          )}
          {explanation.kind === 'second' && explanation.secondProduction !== undefined && (
            <tr>
              <td colSpan={3}>2. landsby (vektet prod.)</td>
              <td>{fmt(explanation.secondProduction)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={3}>
              {explanation.kind === 'second' ? 'Parproduksjon (sum)' : 'Produksjon (sum)'}
            </td>
            <td>{fmt(explanation.production)}</td>
          </tr>
        </tfoot>
      </table>

      <ul className="score-breakdown-lines">
        <li>
          <span>Dekning ({explanation.coveredResources.length}/5 typer)</span>
          <strong>+{fmt(explanation.diversity)}</strong>
        </li>
        <BonusLine label="Pip-kvalitet" value={explanation.pipBonus} />
        <BonusLine label="Rødt tall (6/8)" value={explanation.redAnchorBonus} />
        <BonusLine label="Ørken-straff" value={explanation.desertPenalty} negative />
        <BonusLine label="Få prod. hex" value={explanation.lowHexPenalty} negative />
        <BonusLine label="Ensidig ressurs" value={explanation.monoResourcePenalty} negative />
        {explanation.kind === 'second' && (
          <>
            <BonusLine label="Byggepakker (vei/by/landsby)" value={explanation.buildingSynergy} />
            <BonusLine label="Tømmer+tegl koordinering" value={explanation.coordination} />
            <BonusLine label="Par-pip bonus (14+)" value={explanation.pairPipBonus} />
            <BonusLine label="Utfylling mot 1. landsby" value={explanation.portfolio} />
            <BonusLine label="Overlapp-straff" value={explanation.overlap} negative />
          </>
        )}
        <BonusLine label="Havn" value={explanation.harbor} />
        <li className="score-breakdown-total">
          <span>Total</span>
          <strong>{fmt(explanation.total, 2)}</strong>
        </li>
      </ul>
    </div>
  );
}
