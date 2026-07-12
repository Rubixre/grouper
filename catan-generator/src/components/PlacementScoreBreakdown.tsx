import type { Board } from '../catan/types';
import type { SettlementScore } from '../catan/types';
import { explainPlacementScore } from '../catan/settlements';
import { RESOURCE_LABELS } from '../catan/playerStats';
import type { ProdResource } from '../catan/playerStats';

interface PlacementScoreBreakdownProps {
  score: SettlementScore;
  board: Board;
  rank: number;
  firstVertexId?: string;
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

function pct(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

export function PlacementScoreBreakdown({
  score,
  board,
  rank,
  firstVertexId,
}: PlacementScoreBreakdownProps) {
  const explanation = explainPlacementScore(score, board, firstVertexId);

  return (
    <div className="score-breakdown">
      <h3>Poengforklaring · plassering #{rank}</h3>
      <p className="score-breakdown-formula muted small">
        {explanation.kind === 'first' ? (
          <>
            Total = produksjon + dekning + havn
          </>
        ) : (
          <>
            Total = 2. landsby prod. + utfylling − overlapp + dekning + havn
          </>
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
          <tr>
            <td colSpan={3}>Produksjon (sum)</td>
            <td>{fmt(explanation.production)}</td>
          </tr>
        </tfoot>
      </table>

      <ul className="score-breakdown-lines">
        <li>
          <span>Dekning ({explanation.coveredResources.length}/5 typer)</span>
          <strong>+{fmt(explanation.diversity)}</strong>
        </li>
        {explanation.kind === 'second' && (
          <>
            <li>
              <span>Utfylling mot 1. landsby</span>
              <strong>+{fmt(explanation.portfolio ?? 0)}</strong>
            </li>
            <li>
              <span>Overlapp-straff</span>
              <strong>−{fmt(explanation.overlap ?? 0)}</strong>
            </li>
          </>
        )}
        {explanation.harbor > 0 && (
          <li>
            <span>Havn (maks 3% av prod.)</span>
            <strong>+{fmt(explanation.harbor)}</strong>
          </li>
        )}
        <li className="score-breakdown-total">
          <span>Total</span>
          <strong>{fmt(explanation.total, 2)}</strong>
        </li>
      </ul>
    </div>
  );
}
