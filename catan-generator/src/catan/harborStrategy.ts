import type { Board, HarborType, PlacedSettlement, PlayerCount } from './types';
import { getHarborsForVertex } from './harbors';
import {
  getValidVertices,
  pickGreedyOpponentVertex,
  vertexRawByResource,
} from './settlements';
import { NUMBER_PROB, PROD_RESOURCES, type ProdResource } from './placementModel';
import { RESOURCE_LABELS } from './playerStats';
import { getPlacementOrder } from './draftOrder';

/**
 * Minimum rå pip for én ressurs før havnstrategi vurderes som aktuell.
 * ≈ 6+4 (5/36+3/36) — solid produksjon, ikke bare én svak hex.
 */
export const HARBOR_STRATEGY_PIP_THRESHOLD = (NUMBER_PROB[6]! + NUMBER_PROB[4]!);

export type HarborStrategyKind = 'resource' | 'generic';

export interface HarborStrategyOpportunity {
  resource: ProdResource;
  harborKind: HarborStrategyKind;
  /** Rå pip for fokusressursen i planen */
  resourcePip: number;
  firstVertexId: string;
  secondVertexId?: string;
  /** true når produksjon og havn ligger på samme hjørne */
  sameSpot: boolean;
  summary: string;
  strength: 'strong' | 'moderate';
}

function simulateToHumanSecondTurn(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  humanFirstVertex: string
): PlacedSettlement[] | null {
  let simulated: PlacedSettlement[] = [
    ...placed,
    { vertexId: humanFirstVertex, player: humanPlayer, isCity: false },
  ];
  const order = getPlacementOrder(playerCount);
  let step = simulated.length;

  while (step < order.length) {
    const player = order[step];
    const humanCount = simulated.filter((p) => p.player === humanPlayer).length;
    if (player === humanPlayer && humanCount === 1) return simulated;

    const pickVertexId = pickGreedyOpponentVertex(board, simulated, player);
    if (!pickVertexId) return null;
    simulated = [...simulated, { vertexId: pickVertexId, player, isCity: false }];
    step++;
  }
  return null;
}

function harborMatchesResource(harbor: HarborType, resource: ProdResource): HarborStrategyKind | null {
  if (harbor.kind === 'generic') return 'generic';
  if (harbor.kind === 'resource' && harbor.resource === resource) return 'resource';
  return null;
}

function bestHarborKindOnVertex(
  vertexId: string,
  board: Board,
  resource: ProdResource
): HarborStrategyKind | null {
  let best: HarborStrategyKind | null = null;
  for (const placed of getHarborsForVertex(vertexId, board.harbors)) {
    const kind = harborMatchesResource(placed.definition.harbor, resource);
    if (kind === 'resource') return 'resource';
    if (kind === 'generic') best = 'generic';
  }
  return best;
}

function bestHarborKindOnVertices(
  vertexIds: string[],
  board: Board,
  resource: ProdResource
): { kind: HarborStrategyKind; onVertexId: string } | null {
  let generic: { kind: HarborStrategyKind; onVertexId: string } | null = null;
  for (const vertexId of vertexIds) {
    const kind = bestHarborKindOnVertex(vertexId, board, resource);
    if (kind === 'resource') return { kind, onVertexId: vertexId };
    if (kind === 'generic' && !generic) generic = { kind, onVertexId: vertexId };
  }
  return generic;
}

function combineRaw(
  a: Partial<Record<ProdResource, number>>,
  b: Partial<Record<ProdResource, number>>
): Partial<Record<ProdResource, number>> {
  const out: Partial<Record<ProdResource, number>> = { ...a };
  for (const r of PROD_RESOURCES) {
    const v = b[r] ?? 0;
    if (v > 0) out[r] = (out[r] ?? 0) + v;
  }
  return out;
}

function summarize(
  resource: ProdResource,
  harborKind: HarborStrategyKind,
  resourcePip: number,
  sameSpot: boolean
): { summary: string; strength: 'strong' | 'moderate' } {
  const label = RESOURCE_LABELS[resource].toLowerCase();
  const pipTxt = (resourcePip * 36).toFixed(0);
  if (harborKind === 'resource') {
    return {
      strength: 'strong',
      summary: sameSpot
        ? `God ${label}-produksjon (~${pipTxt}/36) med 2:1 ${label}havn på samme hjørne — mulig spesialiseringsstrategi.`
        : `God ${label}-produksjon (~${pipTxt}/36) kombinert med 2:1 ${label}havn på den andre landsbyen — alternativ til vanlig balansert scoring.`,
    };
  }
  return {
    strength: 'moderate',
    summary: sameSpot
      ? `Solid ${label}-produksjon (~${pipTxt}/36) ved 3:1-havn — svakere enn 2:1, men kan fungere som havnstrategi.`
      : `Solid ${label}-produksjon (~${pipTxt}/36) med 3:1-havn i paret — moderat alternativ hvis 2:1 ikke er ledig.`,
  };
}

function opportunityKey(o: HarborStrategyOpportunity): string {
  return [
    o.resource,
    o.harborKind,
    o.firstVertexId,
    o.secondVertexId ?? '',
    o.sameSpot ? '1' : '0',
  ].join('|');
}

function addOpportunity(
  bag: Map<string, HarborStrategyOpportunity>,
  opportunity: HarborStrategyOpportunity
): void {
  const key = opportunityKey(opportunity);
  const existing = bag.get(key);
  if (!existing || opportunity.resourcePip > existing.resourcePip) {
    bag.set(key, opportunity);
  }
}

function considerPlan(
  bag: Map<string, HarborStrategyOpportunity>,
  board: Board,
  firstVertexId: string,
  secondVertexId: string | undefined,
  combinedRaw: Partial<Record<ProdResource, number>>
): void {
  const vertexIds = secondVertexId ? [firstVertexId, secondVertexId] : [firstVertexId];
  for (const resource of PROD_RESOURCES) {
    const resourcePip = combinedRaw[resource] ?? 0;
    if (resourcePip + 1e-12 < HARBOR_STRATEGY_PIP_THRESHOLD) continue;

    const harbor = bestHarborKindOnVertices(vertexIds, board, resource);
    if (!harbor) continue;

    const firstRaw = vertexRawByResource(firstVertexId, board)[resource] ?? 0;
    const firstHasMatchingHarbor =
      bestHarborKindOnVertex(firstVertexId, board, resource) !== null;
    const trulySameSpot =
      !secondVertexId ||
      (harbor.onVertexId === firstVertexId &&
        firstHasMatchingHarbor &&
        firstRaw + 1e-12 >= HARBOR_STRATEGY_PIP_THRESHOLD);

    const { summary, strength } = summarize(
      resource,
      harbor.kind,
      resourcePip,
      trulySameSpot
    );

    addOpportunity(bag, {
      resource,
      harborKind: harbor.kind,
      resourcePip,
      firstVertexId,
      secondVertexId,
      sameSpot: trulySameSpot,
      summary,
      strength,
    });
  }
}

/**
 * Finn havnstrategier som alternativ til vanlig scoring.
 * Påvirker ikke rangering — kun forslag når produksjon + havn er sterk nok.
 */
export function findHarborStrategyOpportunities(
  board: Board,
  placed: PlacedSettlement[],
  humanPlayer: number,
  playerCount: PlayerCount,
  limit = 4
): HarborStrategyOpportunity[] {
  const bag = new Map<string, HarborStrategyOpportunity>();
  const own = placed.filter((p) => p.player === humanPlayer);
  const valid = getValidVertices(placed);

  if (own.length === 0) {
    // Samme hjørne: produksjon + havn
    for (const vertexId of valid) {
      considerPlan(bag, board, vertexId, undefined, vertexRawByResource(vertexId, board));
    }

    // Split: sterk produksjon + havn på landsby #2 (etter simulerte motspillere)
    const productionCandidates = valid
      .map((vertexId) => {
        const raw = vertexRawByResource(vertexId, board);
        let bestResource: ProdResource | null = null;
        let bestPip = 0;
        for (const r of PROD_RESOURCES) {
          const pip = raw[r] ?? 0;
          if (pip > bestPip) {
            bestPip = pip;
            bestResource = r;
          }
        }
        return { vertexId, raw, bestResource, bestPip };
      })
      .filter((c) => c.bestPip >= HARBOR_STRATEGY_PIP_THRESHOLD * 0.55)
      .sort((a, b) => b.bestPip - a.bestPip)
      .slice(0, 10);

    for (const candidate of productionCandidates) {
      const simulated = simulateToHumanSecondTurn(
        board,
        placed,
        humanPlayer,
        playerCount,
        candidate.vertexId
      );
      if (!simulated) continue;

      for (const secondId of getValidVertices(simulated)) {
        const harbor = bestHarborKindOnVertices(
          [candidate.vertexId, secondId],
          board,
          candidate.bestResource!
        );
        if (!harbor) continue;
        const combined = combineRaw(
          candidate.raw,
          vertexRawByResource(secondId, board)
        );
        if ((combined[candidate.bestResource!] ?? 0) + 1e-12 < HARBOR_STRATEGY_PIP_THRESHOLD) {
          continue;
        }
        considerPlan(bag, board, candidate.vertexId, secondId, combined);
      }
    }
  } else if (own.length === 1) {
    const firstVertexId = own[0]!.vertexId;
    const firstRaw = vertexRawByResource(firstVertexId, board);
    for (const secondId of valid) {
      const combined = combineRaw(firstRaw, vertexRawByResource(secondId, board));
      considerPlan(bag, board, firstVertexId, secondId, combined);
    }
  }

  return [...bag.values()]
    .sort((a, b) => {
      const strengthRank = (s: 'strong' | 'moderate') => (s === 'strong' ? 1 : 0);
      const d = strengthRank(b.strength) - strengthRank(a.strength);
      if (d !== 0) return d;
      return b.resourcePip - a.resourcePip;
    })
    .slice(0, limit);
}
