#!/usr/bin/env python3
"""FPL 2026/27 — én kommando for lagforslag og ukentlige bytter.

Offentlig FPL API. Ingen pip-pakker. Python 3.10+.

Hovedbruk:
  python3 fpl_cli.py link <ENTRY_ID>
  python3 fpl_cli.py suggest
  python3 fpl_cli.py suggest --apply
  python3 fpl_cli.py pull
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

API = "https://fantasy.premierleague.com/api"
BUDGET = 1000  # £100.0m in tenths
SQUAD_LIMITS = {1: 2, 2: 5, 3: 5, 4: 3}
MAX_PER_CLUB = 3
TOOLS_DIR = Path(__file__).resolve().parent
CONFIG_PATH = TOOLS_DIR / "config.json"
SQUAD_PATH = TOOLS_DIR / "my_squad.json"


# ---------------------------------------------------------------------------
# HTTP / context
# ---------------------------------------------------------------------------


def fetch_json(path: str, *, optional: bool = False) -> Any | None:
    url = f"{API}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "fpl-coach/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        if optional and exc.code in {404, 403}:
            return None
        print(f"Kunne ikke hente {url}: HTTP {exc.code}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as exc:
        print(f"Kunne ikke hente {url}: {exc}", file=sys.stderr)
        sys.exit(1)


@dataclass
class Context:
    bootstrap: dict[str, Any]
    fixtures: list[dict[str, Any]]

    @property
    def teams(self) -> dict[int, dict[str, Any]]:
        return {t["id"]: t for t in self.bootstrap["teams"]}

    @property
    def positions(self) -> dict[int, str]:
        return {p["id"]: p["singular_name_short"] for p in self.bootstrap["element_types"]}

    @property
    def players(self) -> list[dict[str, Any]]:
        return [p for p in self.bootstrap["elements"] if p.get("status") != "u"]

    @property
    def by_id(self) -> dict[int, dict[str, Any]]:
        return {p["id"]: p for p in self.bootstrap["elements"]}


def load_context() -> Context:
    return Context(bootstrap=fetch_json("/bootstrap-static/"), fixtures=fetch_json("/fixtures/"))


def fnum(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def team_short(ctx: Context, team_id: int) -> str:
    return ctx.teams[team_id]["short_name"]


def player_label(ctx: Context, p: dict[str, Any]) -> str:
    pos = ctx.positions[p["element_type"]]
    team = team_short(ctx, p["team"])
    price = p["now_cost"] / 10
    return f"{p['web_name']:<14} {pos:<3} {team:<3} £{price:4.1f}"


def available(p: dict[str, Any]) -> bool:
    status = p.get("status", "a")
    if status in {"i", "s", "u"}:
        return False
    chance = p.get("chance_of_playing_next_round")
    if chance is not None and chance <= 25:
        return False
    return p.get("can_select", True)


def is_risk(p: dict[str, Any]) -> bool:
    status = p.get("status", "a")
    if status in {"i", "s", "d", "u"}:
        return True
    chance = p.get("chance_of_playing_next_round")
    return chance is not None and chance < 75


# ---------------------------------------------------------------------------
# Config / local squad (linked to your FPL entry)
# ---------------------------------------------------------------------------


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(cfg: dict[str, Any]) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")


def load_squad() -> dict[str, Any] | None:
    if not SQUAD_PATH.exists():
        return None
    return json.loads(SQUAD_PATH.read_text(encoding="utf-8"))


def save_squad(data: dict[str, Any]) -> None:
    SQUAD_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def next_event(ctx: Context) -> dict[str, Any] | None:
    return next((e for e in ctx.bootstrap["events"] if e.get("is_next")), None)


def current_or_last_event(ctx: Context) -> dict[str, Any] | None:
    cur = next((e for e in ctx.bootstrap["events"] if e.get("is_current")), None)
    if cur:
        return cur
    finished = [e for e in ctx.bootstrap["events"] if e.get("finished")]
    return finished[-1] if finished else None


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def reliable_xgi90(p: dict[str, Any]) -> float:
    minutes = int(p.get("minutes") or 0)
    if minutes < 600:
        return fnum(p.get("expected_goal_involvements")) / 15.0
    return fnum(p.get("expected_goal_involvements_per_90"))


def upcoming_fdr(ctx: Context, team_id: int, next_n: int = 6) -> list[tuple[int, int, str, bool]]:
    events = sorted(
        (e for e in ctx.bootstrap["events"] if not e.get("finished")),
        key=lambda e: e["id"],
    )
    if not events:
        return []
    start = events[0]["id"]
    end = start + next_n - 1
    rows: list[tuple[int, int, str, bool]] = []
    for fx in ctx.fixtures:
        ev = fx.get("event")
        if ev is None or ev < start or ev > end:
            continue
        if fx["team_h"] == team_id:
            rows.append((ev, fx["team_h_difficulty"], team_short(ctx, fx["team_a"]), True))
        elif fx["team_a"] == team_id:
            rows.append((ev, fx["team_a_difficulty"], team_short(ctx, fx["team_h"]), False))
    rows.sort(key=lambda r: r[0])
    return rows[:next_n]


def avg_fdr(ctx: Context, team_id: int, next_n: int = 6) -> float:
    rows = upcoming_fdr(ctx, team_id, next_n)
    if not rows:
        return 3.0
    return sum(r[1] for r in rows) / len(rows)


def fdr_for_event(ctx: Context, team_id: int, gw: int) -> float:
    info = team_fixtures_in_gw(ctx, team_id, gw)
    if not info:
        return 3.0
    return float(sum(f[0] for f in info) / len(info))


def team_fixtures_in_gw(ctx: Context, team_id: int, gw: int) -> list[tuple[int, bool, str]]:
    """Return list of (fdr, is_home, opponent_short) for a team in a GW (DGW => 2+)."""
    rows: list[tuple[int, bool, str]] = []
    for fx in ctx.fixtures:
        if fx.get("event") != gw:
            continue
        if fx["team_h"] == team_id:
            rows.append((int(fx["team_h_difficulty"]), True, team_short(ctx, fx["team_a"])))
        elif fx["team_a"] == team_id:
            rows.append((int(fx["team_a_difficulty"]), False, team_short(ctx, fx["team_h"])))
    return rows


def fixture_multiplier(fdr: int, is_home: bool) -> float:
    """Scale average-fixture points for this opponent (FDR 1=easy … 5=hard)."""
    table = {1: 1.20, 2: 1.10, 3: 1.00, 4: 0.90, 5: 0.78}
    mult = table.get(int(fdr), 1.0)
    mult *= 1.05 if is_home else 0.97
    return mult


def minutes_probability(p: dict[str, Any]) -> float:
    """P(meaningful minutes) for next match — from news + history."""
    status = p.get("status", "a")
    if status in {"i", "s", "u"}:
        return 0.05
    chance = p.get("chance_of_playing_next_round")
    if chance is not None:
        return max(0.05, min(1.0, float(chance) / 100.0))
    if status == "d":
        return 0.55
    starts = int(p.get("starts") or 0)
    minutes = int(p.get("minutes") or 0)
    if starts >= 25 or minutes >= 2200:
        return 0.92
    if starts >= 15 or minutes >= 1200:
        return 0.85
    if starts >= 8 or minutes >= 600:
        return 0.75
    if starts >= 3 or minutes >= 270:
        return 0.60
    # Preseason / unknown: lean on ownership + ep as weak minutes proxy
    ep = fnum(p.get("ep_next"))
    own = fnum(p.get("selected_by_percent"))
    if ep >= 3.0 or own >= 20:
        return 0.88
    if ep >= 2.0 or own >= 8:
        return 0.75
    if ep <= 1.0 and own < 3:
        return 0.25
    return 0.55


def baseline_points_rate(p: dict[str, Any]) -> float:
    """Fixture-neutral points expectation for a full appearance (before FDR/home)."""
    ep = fnum(p.get("ep_next"))
    form = fnum(p.get("form"))
    ppg = fnum(p.get("points_per_game"))
    xgi90 = reliable_xgi90(p)
    pos = p["element_type"]
    # Convert xGI/90 toward FPL points (goal pts by position + assist≈3)
    goal_pts = {1: 10, 2: 6, 3: 5, 4: 4}.get(pos, 4)
    xgi_as_pts = xgi90 * (0.65 * goal_pts + 0.35 * 3.0)
    # Defensive floor for GK/DEF from clean-sheet potential (very rough)
    if pos in {1, 2}:
        xgi_as_pts += 0.35  # small CS/saves baseline noise

    if form > 0 and ppg > 0:
        # In-season: form + recent PPG dominate
        rate = 0.50 * form + 0.30 * ppg + 0.20 * max(xgi_as_pts, ep)
    elif ppg > 0:
        # Preseason: last-season PPG + official EP + xGI
        rate = 0.35 * ep + 0.40 * ppg + 0.25 * max(xgi_as_pts, ep * 0.8)
    else:
        rate = 0.65 * ep + 0.35 * xgi_as_pts
    return max(0.0, rate)


def resolve_target_gw(ctx: Context, gw: int | None = None) -> int:
    if gw is not None:
        return gw
    nxt = next_event(ctx)
    if nxt:
        return int(nxt["id"])
    cur = current_or_last_event(ctx)
    return int(cur["id"]) if cur else 1


def gw_expected_points(ctx: Context, p: dict[str, Any], gw: int | None = None) -> float:
    """Expected FPL points for a player in a specific gameweek.

    Combines:
    - official FPL ep_next (when evaluating the next GW — already fixture-aware)
    - our baseline rate × THIS week's FDR + home/away (and blanks/doubles)
    - minutes probability from injury news / history
    - form (via baseline_points_rate)
    """
    target = resolve_target_gw(ctx, gw)
    fixtures = team_fixtures_in_gw(ctx, p["team"], target)
    if not fixtures:
        return 0.0  # blank GW for this club

    p_min = minutes_probability(p)
    rate = baseline_points_rate(p)
    nxt = next_event(ctx)
    is_next = bool(nxt and target == nxt["id"])
    official = fnum(p.get("ep_next"))

    total = 0.0
    for fdr, is_home, _opp in fixtures:
        mult = fixture_multiplier(fdr, is_home)
        model = rate * mult * p_min
        if is_next and len(fixtures) == 1:
            # ep_next already includes next fixture + much of minutes risk.
            # Blend rather than stack FDR on top of ep_next (avoids double-counting).
            # When form is live, trust recent form more inside rate/model.
            form = fnum(p.get("form"))
            if form > 0:
                total += 0.45 * official + 0.55 * model
            else:
                total += 0.60 * official + 0.40 * model
        elif is_next and len(fixtures) > 1:
            # DGW: ep_next is often single-fixture-ish early; sum our model per fixture
            # but keep a floor from official EP
            total += max(model, official * 0.45)
        else:
            total += model
    return round(total, 3)


def horizon_expected_points(ctx: Context, p: dict[str, Any], n: int = 4) -> float:
    """Sum of gw_expected_points over the next n unfinished gameweeks."""
    events = sorted(
        (e for e in ctx.bootstrap["events"] if not e.get("finished")),
        key=lambda e: e["id"],
    )[:n]
    if not events:
        return gw_expected_points(ctx, p)
    return sum(gw_expected_points(ctx, p, int(e["id"])) for e in events)


def value_ev(ctx: Context, p: dict[str, Any], gw: int | None = None) -> float:
    """Expected points per £1m for next GW — price efficiency."""
    cost = max(p["now_cost"] / 10.0, 3.5)
    return gw_expected_points(ctx, p, gw) / cost


def decision_score(
    ctx: Context,
    p: dict[str, Any],
    *,
    competition: float = 0.0,
    gw: int | None = None,
    horizon: int = 3,
) -> float:
    """Single score for XI/transfers: next-GW EV + short horizon + mild value/diff.

    Units are approximately FPL points (not arbitrary), so −4 hits compare fairly.
    """
    target = resolve_target_gw(ctx, gw)
    ev = gw_expected_points(ctx, p, target)
    # Horizon: average of next GWs excluding current already counted → use remaining
    events = sorted(
        (e for e in ctx.bootstrap["events"] if not e.get("finished")),
        key=lambda e: e["id"],
    )
    future = [e for e in events if int(e["id"]) != target][: max(0, horizon - 1)]
    horiz = sum(gw_expected_points(ctx, p, int(e["id"])) for e in future)
    # Weight: this week matters most for transfers; keep some run quality
    score = ev * 1.0 + horiz * 0.35
    # Mild value tilt (don't overfit cheap junk)
    score += min(value_ev(ctx, p, target), 0.85) * 1.2
    # Competition differentials: small bonus for low ownership when chasing
    own = fnum(p.get("selected_by_percent"))
    score += competition * max(0.0, 25.0 - own) / 40.0
    if is_risk(p):
        score -= 2.5
    if not is_playing_candidate(p):
        score -= 6.0
    return score


# Backwards-compatible names used across the file
def score_player(
    p: dict[str, Any],
    weights: dict[str, float] | None = None,
    *,
    competition: float = 0.0,
) -> float:
    """Legacy draft helper — prefers EP/form/xGI/value without fixture context.

    Draft uses decision_score / horizon via pick_squad key instead where possible.
    """
    w = weights or {
        "ep": 3.5,
        "form": 1.5,
        "xgi90": 2.0,
        "value": 1.0,
        "own_penalty": 0.0,
        "starter": 1.0,
    }
    ep = fnum(p.get("ep_next"))
    form = fnum(p.get("form"))
    xgi90 = reliable_xgi90(p)
    cost = max(p["now_cost"] / 10.0, 3.5)
    value = (ep + form * 0.5 + xgi90) / cost
    own = fnum(p.get("selected_by_percent"))
    p_min = minutes_probability(p)
    starter = (p_min - 0.5) * 6.0
    diff_bonus = competition * max(0.0, 30.0 - own) / 15.0
    return (
        w["ep"] * ep
        + w["form"] * form
        + w["xgi90"] * xgi90
        + w["value"] * value * 10
        + w.get("starter", 1.0) * starter
        - w["own_penalty"] * max(own - 20, 0) / 10
        + diff_bonus
    )


def week_score(ctx: Context, p: dict[str, Any], *, competition: float = 0.0) -> float:
    """Weekly decision score — now true-ish expected points for next GW + horizon."""
    return decision_score(ctx, p, competition=competition)


def is_playing_candidate(p: dict[str, Any]) -> bool:
    """Players we are willing to put in the XI (not pure £4.0 bench fodder)."""
    if not available(p):
        return False
    ep = fnum(p.get("ep_next"))
    starts = int(p.get("starts") or 0)
    minutes = int(p.get("minutes") or 0)
    own = fnum(p.get("selected_by_percent"))
    if ep <= 1.0 and starts < 5 and minutes < 450:
        return False
    if ep >= 1.5:
        return True
    if starts >= 10 or minutes >= 900:
        return True
    if own >= 8.0 and ep > 1.0:
        return True
    return ep > 1.0 and (starts >= 5 or minutes >= 450)


def xi_selection_score(ctx: Context, p: dict[str, Any], *, competition: float = 0.0) -> float:
    """XI pick = next-GW expected points (hard penalty for non-players)."""
    score = gw_expected_points(ctx, p) + 0.25 * decision_score(ctx, p, competition=competition)
    if not is_playing_candidate(p):
        score -= 20.0
    elif fnum(p.get("ep_next")) <= 1.0:
        score -= 6.0
    return score


def player_fixture_label(ctx: Context, p: dict[str, Any], gw: int | None = None) -> str:
    target = resolve_target_gw(ctx, gw)
    fixtures = team_fixtures_in_gw(ctx, p["team"], target)
    if not fixtures:
        return "BLANK"
    parts = []
    for fdr, is_home, opp in fixtures:
        parts.append(f"{'H' if is_home else 'A'}{opp}({fdr})")
    return "/".join(parts)


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------


def pick_squad(ctx: Context, style: str = "balanced", *, competition: float = 0.4) -> list[dict[str, Any]]:
    """XI-first draft: spend on 11 playing candidates, then cheap bench, then upgrades."""
    weights = {
        "balanced": {
            "ep": 3.5,
            "form": 1.5,
            "xgi90": 2.0,
            "value": 1.1,
            "own_penalty": 0.15,
            "starter": 1.2,
        },
        "template": {
            "ep": 3.6,
            "form": 1.2,
            "xgi90": 1.8,
            "value": 0.9,
            "own_penalty": -1.0,
            "starter": 1.3,
        },
        "differential": {
            "ep": 3.0,
            "form": 1.6,
            "xgi90": 2.2,
            "value": 1.3,
            "own_penalty": 1.6,
            "starter": 1.1,
        },
    }[style]

    def key(p: dict[str, Any]) -> float:
        # Draft: next-GW EV + 5-GW horizon + mild legacy score for stability
        return (
            gw_expected_points(ctx, p) * 1.2
            + horizon_expected_points(ctx, p, 5) * 0.25
            + score_player(p, weights, competition=competition) * 0.08
        )

    by_pos: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: [], 4: []}
    playing_by_pos: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: [], 4: []}
    for p in ctx.players:
        if not available(p):
            continue
        by_pos[p["element_type"]].append(p)
        if is_playing_candidate(p):
            playing_by_pos[p["element_type"]].append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=key, reverse=True)
        playing_by_pos[pos].sort(key=key, reverse=True)

    squad: list[dict[str, Any]] = []
    spend = 0
    club_count: dict[int, int] = {}
    counts = {1: 0, 2: 0, 3: 0, 4: 0}
    gk_teams: set[int] = set()
    floor = 40
    bench_slots = 4
    # Reserve cheap bench (£4.0m × 4) while building XI
    xi_reserve = bench_slots * floor

    def can_add(p: dict[str, Any], *, reserve: int = 0) -> bool:
        if counts[p["element_type"]] >= SQUAD_LIMITS[p["element_type"]]:
            return False
        if club_count.get(p["team"], 0) >= MAX_PER_CLUB:
            return False
        if p["element_type"] == 1 and p["team"] in gk_teams:
            return False
        if spend + p["now_cost"] + reserve > BUDGET:
            return False
        if any(s["id"] == p["id"] for s in squad):
            return False
        return True

    def add(p: dict[str, Any]) -> None:
        nonlocal spend
        squad.append(p)
        spend += p["now_cost"]
        counts[p["element_type"]] += 1
        club_count[p["team"]] = club_count.get(p["team"], 0) + 1
        if p["element_type"] == 1:
            gk_teams.add(p["team"])

    # --- Phase 1: XI of playing candidates ---
    # Build XI with mins 1 GK / 3 DEF / 2 MID / 1 FWD, then fill to 11.
    # Keep £16.0m reserved for 4 bench slots while funding starters.
    # First ensure minimums with playing candidates
    for pos, need in ((1, 1), (2, 3), (3, 2), (4, 1)):
        for _ in range(need):
            reserve = xi_reserve + max(0, 10 - len(squad)) * 45  # keep room for remaining XI
            # Simpler: reserve = bench + remaining XI seats at £4.5 floor for flexibility
            remaining_xi = 11 - len(squad) - 1
            reserve = xi_reserve + max(0, remaining_xi) * 45
            picked = next((p for p in playing_by_pos[pos] if can_add(p, reserve=reserve)), None)
            if picked is None:
                # relax reserve slightly
                picked = next((p for p in playing_by_pos[pos] if can_add(p, reserve=xi_reserve)), None)
            if picked is None:
                picked = next((p for p in by_pos[pos] if can_add(p, reserve=xi_reserve)), None)
            if picked:
                add(picked)

    # Fill to 11 XI with best remaining playing candidates (any outfield / already have GK)
    while len(squad) < 11:
        remaining_xi = 11 - len(squad) - 1
        reserve = xi_reserve + max(0, remaining_xi) * 45
        candidates: list[dict[str, Any]] = []
        for pos in (2, 3, 4):
            if counts[pos] >= SQUAD_LIMITS[pos]:
                continue
            # Prefer filling toward xi_targets but allow overflow within squad limits
            for p in playing_by_pos[pos]:
                if can_add(p, reserve=reserve):
                    candidates.append(p)
                    break
        if not candidates:
            for pos in (2, 3, 4, 1):
                if counts[pos] >= SQUAD_LIMITS[pos]:
                    continue
                for p in playing_by_pos[pos]:
                    if can_add(p, reserve=xi_reserve):
                        candidates.append(p)
                        break
        if not candidates:
            # last resort: any available
            for pos in (4, 3, 2, 1):
                if counts[pos] >= SQUAD_LIMITS[pos]:
                    continue
                for p in by_pos[pos]:
                    if can_add(p, reserve=xi_reserve):
                        candidates.append(p)
                        break
        if not candidates:
            break
        add(max(candidates, key=key))

    # --- Phase 2: Fill remaining squad slots (bench) with cheapest legal ---
    while len(squad) < 15:
        missing = [pos for pos, need in SQUAD_LIMITS.items() if counts[pos] < need]
        if not missing:
            # all position quotas met but <15? shouldn't happen with limits summing to 15
            break
        # Prefer completing missing positions with cheapest OK players
        pos = missing[0]
        # If we still need more of a position for quota, pick cheapest; prefer not wrecking XI
        picked = None
        for p in sorted(by_pos[pos], key=lambda x: (x["now_cost"], -key(x))):
            if can_add(p, reserve=0):
                picked = p
                break
        if picked is None:
            # try other missing
            for alt in missing[1:]:
                for p in sorted(by_pos[alt], key=lambda x: (x["now_cost"], -key(x))):
                    if can_add(p, reserve=0):
                        picked = p
                        pos = alt
                        break
                if picked:
                    break
        if picked is None:
            # Downgrade most expensive to free budget
            candidates = [
                (i, p)
                for i, p in enumerate(squad)
                if p["now_cost"] > floor and counts[p["element_type"]] > (
                    1 if p["element_type"] == 1 else 0
                )
            ]
            # Never downgrade below playing-candidate count for GK starter if possible
            if not candidates:
                break
            i, cur = max(candidates, key=lambda ip: ip[1]["now_cost"])
            replacement = None
            for p in sorted(by_pos[cur["element_type"]], key=lambda x: x["now_cost"]):
                if p["id"] == cur["id"] or any(s["id"] == p["id"] for s in squad):
                    continue
                if p["now_cost"] >= cur["now_cost"]:
                    continue
                if cur["element_type"] == 1 and p["team"] in (gk_teams - {cur["team"]}):
                    continue
                tmp = dict(club_count)
                tmp[cur["team"]] -= 1
                tmp[p["team"]] = tmp.get(p["team"], 0) + 1
                if tmp[p["team"]] > MAX_PER_CLUB:
                    continue
                replacement = p
                break
            if replacement is None:
                break
            spend += replacement["now_cost"] - cur["now_cost"]
            club_count[cur["team"]] -= 1
            club_count[replacement["team"]] = club_count.get(replacement["team"], 0) + 1
            if cur["element_type"] == 1:
                gk_teams.discard(cur["team"])
                gk_teams.add(replacement["team"])
            squad[i] = replacement
            continue
        add(picked)

    # --- Phase 3: Spend ITB — upgrade weakest XI players first ---
    itb = BUDGET - spend
    if itb >= 5 and len(squad) == 15:
        # Identify current XI to prioritise upgrades there
        xi_now, _bench = suggest_xi(ctx, squad, competition=competition)
        xi_ids = {p["id"] for p in xi_now}
        squad_ids = {p["id"] for p in squad}
        improved = True
        while improved and itb >= 5:
            improved = False
            # Sort seats: XI non-playing / low EP first, then other XI, then bench
            order = sorted(
                range(len(squad)),
                key=lambda i: (
                    0 if squad[i]["id"] in xi_ids and not is_playing_candidate(squad[i]) else
                    1 if squad[i]["id"] in xi_ids and fnum(squad[i].get("ep_next")) <= 1.5 else
                    2 if squad[i]["id"] in xi_ids else
                    3,
                    key(squad[i]),
                ),
            )
            for i in order:
                cur = squad[i]
                best = None
                best_gain = 0.0
                for p in by_pos[cur["element_type"]]:
                    if p["id"] in squad_ids:
                        continue
                    delta = p["now_cost"] - cur["now_cost"]
                    if delta <= 0 or delta > itb:
                        continue
                    if cur["element_type"] == 1 and p["team"] in gk_teams and p["team"] != cur["team"]:
                        continue
                    tmp_clubs = dict(club_count)
                    tmp_clubs[cur["team"]] -= 1
                    tmp_clubs[p["team"]] = tmp_clubs.get(p["team"], 0) + 1
                    if tmp_clubs[p["team"]] > MAX_PER_CLUB:
                        continue
                    # Prefer upgrading into playing candidates when replacing XI seat
                    gain = key(p) - key(cur)
                    if cur["id"] in xi_ids and is_playing_candidate(p) and not is_playing_candidate(cur):
                        gain += 5.0
                    if gain > best_gain:
                        best_gain = gain
                        best = p
                threshold = 0.25 if (cur["id"] in xi_ids and not is_playing_candidate(cur)) else 0.35
                if best and best_gain > threshold:
                    delta = best["now_cost"] - cur["now_cost"]
                    club_count[cur["team"]] -= 1
                    club_count[best["team"]] = club_count.get(best["team"], 0) + 1
                    if cur["element_type"] == 1:
                        gk_teams.discard(cur["team"])
                        gk_teams.add(best["team"])
                    squad[i] = best
                    squad_ids.remove(cur["id"])
                    squad_ids.add(best["id"])
                    spend += delta
                    itb -= delta
                    # refresh XI ids after meaningful change
                    xi_now, _ = suggest_xi(ctx, squad, competition=competition)
                    xi_ids = {p["id"] for p in xi_now}
                    improved = True
                    break

    return squad


def suggest_xi(
    ctx: Context,
    squad: list[dict[str, Any]],
    *,
    competition: float = 0.0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    def key(p: dict[str, Any]) -> float:
        return xi_selection_score(ctx, p, competition=competition)

    by_pos: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: [], 4: []}
    for p in squad:
        by_pos[p["element_type"]].append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=key, reverse=True)

    def best_playing(pos: int, n: int) -> list[dict[str, Any]]:
        playing = [p for p in by_pos[pos] if is_playing_candidate(p)]
        pool = playing if len(playing) >= n else by_pos[pos]
        return pool[:n]

    # Prefer playing candidates for the seeded XI
    xi: list[dict[str, Any]] = []
    xi.extend(best_playing(1, 1))
    xi.extend(best_playing(2, 3))
    xi.extend(best_playing(3, 2))
    xi.extend(best_playing(4, 1))
    chosen = {p["id"] for p in xi}
    rest = sorted((p for p in squad if p["id"] not in chosen), key=key, reverse=True)
    def_count = sum(1 for p in xi if p["element_type"] == 2)
    mid_count = sum(1 for p in xi if p["element_type"] == 3)
    fwd_count = sum(1 for p in xi if p["element_type"] == 4)
    for p in rest:
        if len(xi) >= 11:
            break
        pos = p["element_type"]
        if pos == 1:
            continue
        if pos == 2 and def_count >= 5:
            continue
        if pos == 3 and mid_count >= 5:
            continue
        if pos == 4 and fwd_count >= 3:
            continue
        # Skip non-playing candidates while better playing options remain
        if not is_playing_candidate(p):
            better = [
                q
                for q in rest
                if q["id"] not in chosen
                and q["id"] != p["id"]
                and is_playing_candidate(q)
                and q["element_type"] != 1
                and not (q["element_type"] == 2 and def_count >= 5)
                and not (q["element_type"] == 3 and mid_count >= 5)
                and not (q["element_type"] == 4 and fwd_count >= 3)
            ]
            if better:
                continue
        xi.append(p)
        chosen.add(p["id"])
        if pos == 2:
            def_count += 1
        elif pos == 3:
            mid_count += 1
        elif pos == 4:
            fwd_count += 1
    # If still short of 11 (edge case), fill anything legal
    if len(xi) < 11:
        for p in rest:
            if len(xi) >= 11:
                break
            if p["id"] in chosen or p["element_type"] == 1:
                continue
            pos = p["element_type"]
            if pos == 2 and def_count >= 5:
                continue
            if pos == 3 and mid_count >= 5:
                continue
            if pos == 4 and fwd_count >= 3:
                continue
            xi.append(p)
            chosen.add(p["id"])
            if pos == 2:
                def_count += 1
            elif pos == 3:
                mid_count += 1
            elif pos == 4:
                fwd_count += 1

    xi_ids = {p["id"] for p in xi}
    bench = sorted((p for p in squad if p["id"] not in xi_ids), key=key, reverse=True)
    outfield_bench = [p for p in bench if p["element_type"] != 1]
    gk_bench = [p for p in bench if p["element_type"] == 1]
    return xi, outfield_bench + gk_bench


def pick_captain(ctx: Context, xi: list[dict[str, Any]]) -> dict[str, Any]:
    gw = resolve_target_gw(ctx)

    def capt_key(p: dict[str, Any]) -> float:
        ev = gw_expected_points(ctx, p, gw)
        fixtures = team_fixtures_in_gw(ctx, p["team"], gw)
        home_bonus = 0.35 if fixtures and fixtures[0][1] else 0.0
        return (
            ev * 3.0
            + home_bonus
            - (5.0 if is_risk(p) else 0.0)
            - (10.0 if not is_playing_candidate(p) else 0.0)
            - (2.5 if p["element_type"] == 1 else 0.0)
        )

    return max(xi, key=capt_key)


# ---------------------------------------------------------------------------
# Transfers linked to your squad
# ---------------------------------------------------------------------------


def club_counts(squad: list[dict[str, Any]]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for p in squad:
        counts[p["team"]] = counts.get(p["team"], 0) + 1
    return counts


def legal_replacement(
    squad: list[dict[str, Any]],
    out_p: dict[str, Any],
    in_p: dict[str, Any],
    bank: int,
) -> bool:
    if out_p["element_type"] != in_p["element_type"]:
        return False
    if not available(in_p) and not is_risk(out_p):
        # allow only if replacing risk, still prefer available
        pass
    if not available(in_p):
        return False
    if any(p["id"] == in_p["id"] for p in squad):
        return False
    sell = out_p["now_cost"]  # approx; true sell price needs auth API
    if in_p["now_cost"] > bank + sell:
        return False
    clubs = club_counts(squad)
    clubs[out_p["team"]] -= 1
    clubs[in_p["team"]] = clubs.get(in_p["team"], 0) + 1
    if clubs[in_p["team"]] > MAX_PER_CLUB:
        return False
    if out_p["element_type"] == 1:
        gk_teams = {p["team"] for p in squad if p["element_type"] == 1 and p["id"] != out_p["id"]}
        if in_p["team"] in gk_teams:
            return False
    return True


def best_single_transfers(
    ctx: Context,
    squad: list[dict[str, Any]],
    bank: int,
    *,
    competition: float,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Rank transfers by expected-points gain (next GW + short horizon)."""
    pool = [p for p in ctx.players if available(p)]
    target = resolve_target_gw(ctx)
    moves: list[dict[str, Any]] = []
    for out_p in squad:
        out_ev = gw_expected_points(ctx, out_p, target)
        out_h = horizon_expected_points(ctx, out_p, 4)
        out_s = decision_score(ctx, out_p, competition=competition, gw=target)
        urgency = 2.5 if is_risk(out_p) else (1.5 if out_ev <= 0.5 else 0.0)
        for in_p in pool:
            if not legal_replacement(squad, out_p, in_p, bank):
                continue
            in_ev = gw_expected_points(ctx, in_p, target)
            in_h = horizon_expected_points(ctx, in_p, 4)
            # Primary: this week EP delta + partial horizon (points units)
            gain = (in_ev - out_ev) + 0.35 * (in_h - out_h) + urgency
            # Mild value / competition via decision_score residual
            gain += 0.15 * (
                decision_score(ctx, in_p, competition=competition, gw=target) - out_s
            )
            if gain <= 0.4 and urgency == 0:
                continue
            moves.append(
                {
                    "out": out_p,
                    "in": in_p,
                    "gain": gain,
                    "ev_delta": in_ev - out_ev,
                    "cost_delta": in_p["now_cost"] - out_p["now_cost"],
                    "must": is_risk(out_p) or out_ev <= 0.2,
                    "out_fx": player_fixture_label(ctx, out_p, target),
                    "in_fx": player_fixture_label(ctx, in_p, target),
                }
            )
    moves.sort(key=lambda m: (m["must"], m["gain"]), reverse=True)
    seen_out: set[int] = set()
    seen_in: set[int] = set()
    unique: list[dict[str, Any]] = []
    for m in moves:
        if m["out"]["id"] in seen_out or m["in"]["id"] in seen_in:
            continue
        unique.append(m)
        seen_out.add(m["out"]["id"])
        seen_in.add(m["in"]["id"])
        if len(unique) >= limit:
            break
    return unique


def apply_move(squad: list[dict[str, Any]], bank: int, move: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    new_squad = []
    for p in squad:
        if p["id"] == move["out"]["id"]:
            new_squad.append(move["in"])
        else:
            new_squad.append(p)
    new_bank = bank + move["out"]["now_cost"] - move["in"]["now_cost"]
    return new_squad, new_bank


def choose_transfer_plan(
    ctx: Context,
    squad: list[dict[str, Any]],
    bank: int,
    free_transfers: int,
    *,
    competition: float,
) -> dict[str, Any]:
    """Choose 0–2 transfers maximizing expected points net of hit cost (−4 each)."""
    singles = best_single_transfers(ctx, squad, bank, competition=competition, limit=12)

    plans: list[dict[str, Any]] = [
        {"moves": [], "gain": 0.0, "hit": 0, "net": 0.0, "squad": squad, "bank": bank}
    ]

    if singles:
        m = singles[0]
        s1, b1 = apply_move(squad, bank, m)
        hit = 0 if free_transfers >= 1 else 4
        plans.append(
            {
                "moves": [m],
                "gain": m["gain"],
                "hit": hit,
                "net": m["gain"] - hit,
                "squad": s1,
                "bank": b1,
            }
        )

    if singles:
        m1 = singles[0]
        s1, b1 = apply_move(squad, bank, m1)
        second = best_single_transfers(ctx, s1, b1, competition=competition, limit=8)
        if second:
            m2 = second[0]
            s2, b2 = apply_move(s1, b1, m2)
            transfers_used = 2
            hit = max(0, transfers_used - free_transfers) * 4
            gain = m1["gain"] + m2["gain"]
            plans.append(
                {
                    "moves": [m1, m2],
                    "gain": gain,
                    "hit": hit,
                    "net": gain - hit,
                    "squad": s2,
                    "bank": b2,
                }
            )

    must_plans = [p for p in plans if any(m.get("must") for m in p["moves"])]
    if must_plans:
        return max(must_plans, key=lambda p: p["net"])

    # Hits only if expected points gain clearly exceeds hit cost
    viable = [p for p in plans if p["hit"] == 0 or p["net"] >= 1.5]
    return max(viable, key=lambda p: p["net"])


def competition_pressure(cfg: dict[str, Any]) -> float:
    """0..1.5 — higher when chasing in mini-league."""
    league_id = cfg.get("league_id")
    entry_id = cfg.get("entry_id")
    if not league_id or not entry_id:
        return 0.5  # default mild differential lean for private leagues
    data = fetch_json(f"/leagues-classic/{league_id}/standings/", optional=True)
    if not data:
        return 0.5
    results = data.get("standings", {}).get("results") or []
    if not results:
        return 0.5
    my = next((r for r in results if r.get("entry") == entry_id), None)
    if not my:
        return 0.5
    rank = int(my.get("rank") or my.get("entry_rank") or 1)
    total = len(results)
    if rank <= 2:
        return 0.15  # protect lead — more template
    if rank <= max(3, total // 3):
        return 0.55
    return 1.2  # chasing — more differentials


def resolve_free_transfers(squad_data: dict[str, Any], cfg: dict[str, Any]) -> int:
    if "free_transfers" in squad_data:
        return int(squad_data["free_transfers"])
    # Preseason / unknown: treat as unlimited for planning display, but suggest building squad
    if squad_data.get("phase") == "preseason":
        return 99
    return 1


def print_squad_block(ctx: Context, squad: list[dict[str, Any]], title: str) -> None:
    gw = resolve_target_gw(ctx)
    print(f"=== {title} ===")
    print(f"(GW{gw}: vår EV | FPL ep_next | motstander FDR | form | £/EV)")
    for pos_id in (1, 2, 3, 4):
        print(f"\n{ctx.positions[pos_id]}:")
        rows = [x for x in squad if x["element_type"] == pos_id]
        rows.sort(key=lambda x: gw_expected_points(ctx, x, gw), reverse=True)
        for p in rows:
            risk = " ⚠" if is_risk(p) else ""
            ev = gw_expected_points(ctx, p, gw)
            form = fnum(p.get("form"))
            print(
                f"  {player_label(ctx, p)}  EV {ev:4.1f}  "
                f"ep {fnum(p.get('ep_next')):4.1f}  "
                f"{player_fixture_label(ctx, p, gw):<12}  "
                f"form {form:3.1f}  "
                f"val {value_ev(ctx, p, gw):4.2f}{risk}"
            )


def print_xi_block(
    ctx: Context,
    xi: list[dict[str, Any]],
    bench: list[dict[str, Any]],
    capt: dict[str, Any],
    *,
    triple: bool = False,
) -> None:
    gw = resolve_target_gw(ctx)
    print("\n=== Startellever ===")
    xi_ev = 0.0
    for p in xi:
        mark = " (C)" if p["id"] == capt["id"] else ""
        ev = gw_expected_points(ctx, p, gw)
        xi_ev += ev
        print(
            f"  {player_label(ctx, p)}  EV {ev:4.1f}  "
            f"{player_fixture_label(ctx, p, gw)}{mark}"
        )
    print("\n=== Benk ===")
    bench_ev = 0.0
    for i, p in enumerate(bench, 1):
        ev = gw_expected_points(ctx, p, gw)
        bench_ev += ev
        print(
            f"  {i}. {player_label(ctx, p)}  EV {ev:4.1f}  "
            f"{player_fixture_label(ctx, p, gw)}"
        )
    vc = max(
        (p for p in xi if p["id"] != capt["id"]),
        key=lambda p: gw_expected_points(ctx, p, gw),
        default=None,
    )
    cap_mult = "3× (Triple Captain)" if triple else "2×"
    capt_ev = gw_expected_points(ctx, capt, gw)
    lineup = xi_ev + capt_ev * (2.0 if triple else 1.0)
    print(f"\nKaptein ({cap_mult}): {capt['web_name']} (EV {capt_ev:.1f})")
    if vc:
        print(f"VC:      {vc['web_name']} (EV {gw_expected_points(ctx, vc, gw):.1f})")
    print(f"Forventet XI+C: {lineup:.1f}  |  benk: {bench_ev:.1f}")


# ---------------------------------------------------------------------------
# Chips (2 sett: GW1–19 og GW20–38, maks 1 chip / GW)
# ---------------------------------------------------------------------------

CHIP_NAMES = {
    "wildcard": "Wildcard",
    "freehit": "Free Hit",
    "bboost": "Bench Boost",
    "3xc": "Triple Captain",
}
CHIP_KEYS = ("wildcard", "freehit", "bboost", "3xc")
HALF1_END = 19

# Official early TC targets 2026/27 (PL Scout): premium home vs promoted
H1_TC_TARGETS = [
    (2, "B.Fernandes", "IPS"),
    (3, "Haaland", "COV"),
    (7, "Haaland", "IPS"),
    (14, "B.Fernandes", "COV"),
    (16, "Haaland", "HUL"),
]


def ensure_chip_state(cfg: dict[str, Any]) -> dict[str, Any]:
    chips = cfg.setdefault(
        "chips",
        {
            "h1": {k: None for k in CHIP_KEYS},
            "h2": {k: None for k in CHIP_KEYS},
        },
    )
    for half in ("h1", "h2"):
        chips.setdefault(half, {})
        for k in CHIP_KEYS:
            chips[half].setdefault(k, None)
    return chips


def chip_half_key(gw: int) -> str:
    return "h1" if gw <= HALF1_END else "h2"


def chip_rules_from_api(ctx: Context) -> dict[str, list[dict[str, Any]]]:
    rules: dict[str, list[dict[str, Any]]] = {k: [] for k in CHIP_KEYS}
    for chip in ctx.bootstrap.get("chips") or []:
        name = chip.get("name")
        if name in rules:
            rules[name].append(chip)
    return rules


def chip_window(ctx: Context, name: str, gw: int) -> dict[str, Any] | None:
    for chip in chip_rules_from_api(ctx).get(name, []):
        if chip["start_event"] <= gw <= chip["stop_event"]:
            return chip
    return None


def chip_available(cfg: dict[str, Any], ctx: Context, name: str, gw: int) -> bool:
    ensure_chip_state(cfg)
    if chip_window(ctx, name, gw) is None:
        return False
    half = chip_half_key(gw)
    if cfg["chips"][half].get(name) is not None:
        return False
    # Official: FH not in GW1; FH in GW19 blocks FH in GW20
    if name == "freehit" and gw == 1:
        return False
    if name == "freehit" and gw == 20 and cfg["chips"]["h1"].get("freehit") == 19:
        return False
    return True


def mark_chip_used(cfg: dict[str, Any], name: str, gw: int) -> None:
    ensure_chip_state(cfg)
    half = chip_half_key(gw)
    cfg["chips"][half][name] = gw
    save_config(cfg)


def team_fixture_counts(ctx: Context, gw: int) -> dict[int, int]:
    counts = {tid: 0 for tid in ctx.teams}
    for fx in ctx.fixtures:
        if fx.get("event") != gw:
            continue
        counts[fx["team_h"]] = counts.get(fx["team_h"], 0) + 1
        counts[fx["team_a"]] = counts.get(fx["team_a"], 0) + 1
    return counts


def gw_structure(ctx: Context, gw: int) -> dict[str, Any]:
    counts = team_fixture_counts(ctx, gw)
    blanks = [tid for tid, n in counts.items() if n == 0]
    doubles = [tid for tid, n in counts.items() if n >= 2]
    return {
        "blank_teams": blanks,
        "double_teams": doubles,
        "is_bgw": len(blanks) >= 2,
        "is_dgw": len(doubles) >= 1,
        "fixture_total": sum(counts.values()) // 2,
    }


def player_ep(ctx: Context, p: dict[str, Any], gw: int | None = None) -> float:
    return gw_expected_points(ctx, p, gw)


def estimate_lineup_ep(
    ctx: Context,
    xi: list[dict[str, Any]],
    capt: dict[str, Any],
    *,
    triple: bool = False,
    gw: int | None = None,
) -> float:
    """Expected points: sum of our GW EV + extra captain multiplier."""
    target = resolve_target_gw(ctx, gw)
    base = sum(gw_expected_points(ctx, p, target) for p in xi)
    extra = gw_expected_points(ctx, capt, target) * (2.0 if triple else 1.0)
    return base + extra


def remaining_tc_targets(cfg: dict[str, Any], gw: int) -> list[tuple[int, str, str]]:
    if gw > HALF1_END:
        return []
    if cfg.get("chips", {}).get("h1", {}).get("3xc") is not None:
        return []
    return [(g, n, o) for g, n, o in H1_TC_TARGETS if g >= gw]


def recommend_chip(
    ctx: Context,
    cfg: dict[str, Any],
    gw: int,
    squad: list[dict[str, Any]],
    xi: list[dict[str, Any]],
    bench: list[dict[str, Any]],
    capt: dict[str, Any],
) -> dict[str, Any]:
    """Pick at most one chip for this GW by expected incremental points."""
    ensure_chip_state(cfg)
    structure = gw_structure(ctx, gw)
    baseline = estimate_lineup_ep(ctx, xi, capt, triple=False, gw=gw)
    bench_ep = sum(gw_expected_points(ctx, p, gw) for p in bench)
    capt_ep = gw_expected_points(ctx, capt, gw)
    tc_extra = capt_ep  # TC adds one more copy vs normal captain
    bb_extra = bench_ep
    half = chip_half_key(gw)
    weeks_left = (HALF1_END - gw) if half == "h1" else (38 - gw)
    forced = weeks_left <= 1  # expire soon

    candidates: list[dict[str, Any]] = []

    # --- Triple Captain ---
    if chip_available(cfg, ctx, "3xc", gw):
        def tc_captain_score(p: dict[str, Any]) -> float:
            s = gw_expected_points(ctx, p, gw) * 2
            fdr = fdr_for_event(ctx, p["team"], gw)
            if fdr <= 2:
                s += 1.5
            if structure["is_dgw"] and p["team"] in structure["double_teams"]:
                s += 5.0
            for g, name, opp in remaining_tc_targets(cfg, gw):
                if g == gw and p["web_name"] == name:
                    s += 4.0
            if is_risk(p):
                s -= 5.0
            if p["element_type"] == 1:
                s -= 4.0
            if not is_playing_candidate(p):
                s -= 10.0
            return s

        tc_capt = max(xi, key=tc_captain_score)
        tc_extra = gw_expected_points(ctx, tc_capt, gw)
        score = tc_extra
        reason = f"TC gir +{tc_extra:.1f} EP (ekstra 1× på {tc_capt['web_name']})"
        if tc_capt["id"] != capt["id"]:
            reason += f" | bytt kaptein fra {capt['web_name']} → {tc_capt['web_name']}"
        fdr = fdr_for_event(ctx, tc_capt["team"], gw)
        if structure["is_dgw"] and tc_capt["team"] in structure["double_teams"]:
            score += 4.0
            reason += " | kaptein har DGW (høyeste TC-EV)"
        for g, name, opp in remaining_tc_targets(cfg, gw):
            if g == gw and tc_capt["web_name"] == name:
                score += 2.5
                reason += f" | Scout-mål: {name} H vs {opp}"
                break
        if fdr <= 2:
            score += 1.0
        later = [t for t in remaining_tc_targets(cfg, gw) if t[0] > gw]
        # If this IS a scout target week, don't penalize for later windows
        is_target_week = any(g == gw and tc_capt["web_name"] == n for g, n, _ in H1_TC_TARGETS)
        if later and score < 7.0 and not structure["is_dgw"] and not forced and not is_target_week:
            score -= 1.5
            reason += f" | bedre TC-vindu senere: GW{later[0][0]} {later[0][1]}"
        if forced and score < 3:
            score += 2.0
            reason += " | halvdelen utløper — bruk TC nå"
        play = score >= 5.5 or (forced and score >= 3) or (is_target_week and score >= 5.0)
        candidates.append(
            {
                "chip": "3xc",
                "ev": score,
                "delta_ep": tc_extra,
                "reason": reason,
                "play": play,
                "captain": tc_capt["web_name"],
            }
        )

    # --- Bench Boost ---
    if chip_available(cfg, ctx, "bboost", gw):
        score = bb_extra
        reason = f"BB gir +{bb_extra:.1f} EP fra benken"
        risky_bench = sum(1 for p in bench if is_risk(p))
        if risky_bench:
            score -= 2.0 * risky_bench
            reason += f" | {risky_bench} usikre på benk"
        if structure["is_dgw"]:
            dgw_bench = sum(1 for p in bench if p["team"] in structure["double_teams"])
            score += 1.5 * dgw_bench
            reason += f" | {dgw_bench} DGW på benk"
        # Prefer after WC in same half (unlimited transfers to build 15)
        wc_gw = cfg["chips"][half].get("wildcard")
        if wc_gw is not None and gw == wc_gw + 1:
            score += 2.0
            reason += " | uken etter Wildcard (klassisk høy-EV)"
        if gw == 1 and bb_extra < 10:
            score -= 2.0
            reason += " | GW1-BB ofte svakere enn senere"
        if forced and bb_extra >= 6:
            score += 2.0
            reason += " | halvdelen utløper"
        play = score >= 10.0 or (forced and bb_extra >= 6) or (structure["is_dgw"] and bb_extra >= 8)
        candidates.append(
            {"chip": "bboost", "ev": score, "delta_ep": bb_extra, "reason": reason, "play": play}
        )

    # --- Free Hit ---
    if chip_available(cfg, ctx, "freehit", gw):
        blank_in_squad = sum(
            1 for p in squad if team_fixture_counts(ctx, gw).get(p["team"], 0) == 0
        )
        score = 0.0
        reason = "FH: midlertidig tropp, tilbakestilles neste deadline"
        if structure["is_bgw"] and blank_in_squad >= 3:
            score = 6.0 + blank_in_squad
            reason = f"BGW: {blank_in_squad} i troppen blanker — FH er beste redning"
        elif blank_in_squad >= 4:
            score = 5.0 + blank_in_squad * 0.5
            reason = f"{blank_in_squad} uten kamp — vurder FH"
        elif forced and not structure["is_bgw"]:
            score = 2.0
            reason = "Halvdelen utløper uten BGW — bruk FH på verste fixture-uke, ikke kast bort"
        # Don't burn FH early without blanks
        if gw <= 10 and not structure["is_bgw"]:
            score -= 3.0
        play = score >= 8.0 or (forced and structure["is_bgw"])
        # Never recommend FH19 if it blocks nothing useful - actually FH19 blocks FH20
        if gw == 19:
            score -= 1.0
            reason += " | unngå FH i GW19 hvis du vil ha FH i GW20"
        candidates.append(
            {"chip": "freehit", "ev": score, "delta_ep": max(score, 0), "reason": reason, "play": play}
        )

    # --- Wildcard ---
    if chip_available(cfg, ctx, "wildcard", gw):
        risks = sum(1 for p in squad if is_risk(p))
        score = 0.0
        reason = "WC: permanente ubegrensede bytter"
        if risks >= 3:
            score = 8.0 + risks
            reason = f"{risks} skade/tvil — WC for å redde troppen"
        elif half == "h1" and 6 <= gw <= 9:
            score = 6.5
            reason = "H1-vindu GW6–9: nok data + tid til å bygge BB-benk"
        elif half == "h2" and structure["is_dgw"]:
            score = 5.0
            reason = "Vurder WC *før* stor DGW (ikke nødvendigvis denne uken)"
        elif half == "h2" and 25 <= gw <= 32:
            score = 6.0
            reason = "H2-vindu: sett opp DGW/BB-tropp"
        if forced and risks >= 1:
            score += 3.0
            reason += " | utløper snart"
        # Don't WC GW2 unless disaster
        if gw <= 3 and risks < 3:
            score -= 4.0
            reason += " | for tidlig uten krise"
        play = score >= 7.5 or (forced and risks >= 2)
        candidates.append(
            {"chip": "wildcard", "ev": score, "delta_ep": score, "reason": reason, "play": play}
        )

    candidates.sort(key=lambda c: c["ev"], reverse=True)
    playable = [c for c in candidates if c["play"]]
    chosen = playable[0] if playable else None

    # Max one chip / week already enforced by returning single choice
    return {
        "gw": gw,
        "half": half,
        "baseline_ep": baseline,
        "bench_ep": bench_ep,
        "capt_ep": capt_ep,
        "structure": structure,
        "candidates": candidates,
        "chosen": chosen,
        "weeks_left_in_half": weeks_left,
    }


def print_chip_advice(advice: dict[str, Any], cfg: dict[str, Any]) -> None:
    gw = advice["gw"]
    half_label = "1. halvdel (GW1–19)" if advice["half"] == "h1" else "2. halvdel (GW20–38)"
    print(f"\n=== Chips — {half_label}, GW{gw} ===")
    print("Regler: 2 sett (WC/FH/BB/TC hver) · maks 1 chip per uke · sett 1 utløper GW19-deadline")
    st = advice["structure"]
    if st["is_dgw"]:
        print(f"Struktur: DOUBLE GW ({len(st['double_teams'])} lag med 2 kamper)")
    elif st["is_bgw"]:
        print(f"Struktur: BLANK GW ({len(st['blank_teams'])} lag uten kamp)")
    else:
        print("Struktur: vanlig GW (10 kamper)")
    print(
        f"Modell: XI+C ≈ {advice['baseline_ep']:.1f} EP | "
        f"benk ≈ {advice['bench_ep']:.1f} EP | kaptein EP {advice['capt_ep']:.1f}"
    )

    ensure_chip_state(cfg)
    status = cfg["chips"][advice["half"]]
    bits = []
    for k in CHIP_KEYS:
        used = status.get(k)
        bits.append(f"{CHIP_NAMES[k]}={'GW'+str(used) if used else 'ledig'}")
    print("Status:", " · ".join(bits))

    chosen = advice["chosen"]
    if chosen:
        print(
            f"\n→ ANBEFALT CHIP: {CHIP_NAMES[chosen['chip']]} "
            f"(modell-EV {chosen['ev']:.1f})"
        )
        print(f"  {chosen['reason']}")
        print("  Merk av: python3 fpl_cli.py chips use " + chosen["chip"])
    else:
        print("\n→ ANBEFALT CHIP: ingen denne uken (spar til høyere EV)")
        later_tc = remaining_tc_targets(cfg, gw)
        if later_tc:
            g, n, o = later_tc[0]
            print(f"  Neste TC-mål H1: GW{g} {n} hjemme vs {o}")
        top = advice["candidates"][0] if advice["candidates"] else None
        if top:
            print(
                f"  Nærmeste kandidat: {CHIP_NAMES[top['chip']]} "
                f"(EV {top['ev']:.1f}) — {top['reason']}"
            )


def print_season_chip_plan(ctx: Context, cfg: dict[str, Any]) -> None:
    ensure_chip_state(cfg)
    print("=== Optimal chip-taktikk 2026/27 (forventet mest poeng) ===\n")
    print("Poengsystem (kort): minutter 1/2 · mål GKP10/DEF6/MID5/FWD4 · assist 3 ·")
    print("CS GKP/DEF 4, MID 1 · saves 1/3 · DC +2 · bonus 1–3 · C=2× / TC=3×\n")
    print("Hvorfor denne rekkefølgen:")
    print("  1) BB på DGW (eller 15 starters) = høyeste enkelt-EV i spillet")
    print("  2) TC på DGW-premium eller beste enkeltkamp (Scout: Haaland/Bruno vs opprykk)")
    print("  3) WC for å *bygge* BB/TC-vinduer — ikke panikkuke 2")
    print("  4) FH nesten bare på BGW (mange blanke)\n")

    print("--- 1. halvdel (bruk før GW19-deadline 2. jan 2027 14:30) ---")
    print("  WC:  mål GW6–9 (etter data). Bygg sterke 15 før BB.")
    print("  BB:  uken etter WC, eller når benk-EP ≳ 10–12. Unngå svak GW1-BB.")
    print("  TC:  beste av GW2 Bruno–IPS, GW3 Haaland–COV, GW7 Haaland–IPS,")
    print("       GW14 Bruno–COV, GW16 Haaland–HUL — ellers hold til DGW hvis den kommer.")
    print("  FH:  hold til BGW. Ikke FH i GW19 hvis du vil ha FH i GW20.")
    h1 = cfg["chips"]["h1"]
    for k in CHIP_KEYS:
        print(f"    {CHIP_NAMES[k]}: {'brukt GW'+str(h1[k]) if h1[k] else 'ledig'}")

    print("\n--- 2. halvdel (GW20–38) ---")
    print("  Hold chips til cup-omberamming → BGW/DGW.")
    print("  WC → sett opp 15 DGW-spillere → BB på beste DGW.")
    print("  TC på DGW-premium (ofte bedre enn H1-enkeltkamp).")
    print("  FH på verste BGW.")
    h2 = cfg["chips"]["h2"]
    for k in CHIP_KEYS:
        print(f"    {CHIP_NAMES[k]}: {'brukt GW'+str(h2[k]) if h2[k] else 'ledig'}")

    nxt = next_event(ctx)
    if nxt:
        print(f"\nNeste deadline: {nxt['name']} {nxt.get('deadline_time')}")


def cmd_chips(ctx: Context, args: argparse.Namespace) -> None:
    cfg = load_config()
    ensure_chip_state(cfg)
    if args.action == "plan" or args.action is None:
        print_season_chip_plan(ctx, cfg)
        # Also this-week advice if we have a squad
        data = load_squad()
        nxt = next_event(ctx)
        gw = nxt["id"] if nxt else 1
        if data:
            squad = squad_from_ids(ctx, data["element_ids"])
            xi, bench = suggest_xi(ctx, squad)
            capt = pick_captain(ctx, xi)
            advice = recommend_chip(ctx, cfg, gw, squad, xi, bench, capt)
            print_chip_advice(advice, cfg)
        else:
            print("\n(Kjør `suggest` først for ukentlig chip-råd knyttet til troppen din.)")
        return

    if args.action == "use":
        if not args.chip:
            print("Bruk: python3 fpl_cli.py chips use 3xc|bboost|freehit|wildcard", file=sys.stderr)
            sys.exit(2)
        name = args.chip.lower().replace("tc", "3xc").replace("bb", "bboost").replace("fh", "freehit").replace("wc", "wildcard")
        aliases = {"triplecaptain": "3xc", "benchboost": "bboost"}
        name = aliases.get(name, name)
        if name not in CHIP_KEYS:
            print(f"Ukjent chip: {args.chip}", file=sys.stderr)
            sys.exit(2)
        nxt = next_event(ctx)
        gw = int(args.gw) if args.gw else (nxt["id"] if nxt else 1)
        if not chip_available(cfg, ctx, name, gw):
            print(f"Kan ikke merke {CHIP_NAMES[name]} som brukt i GW{gw} (ikke tilgjengelig).", file=sys.stderr)
            sys.exit(2)
        mark_chip_used(cfg, name, gw)
        print(f"Merket {CHIP_NAMES[name]} som brukt i GW{gw} ({chip_half_key(gw)}).")
        return

    if args.action == "reset":
        cfg["chips"] = {"h1": {k: None for k in CHIP_KEYS}, "h2": {k: None for k in CHIP_KEYS}}
        save_config(cfg)
        print("Chip-status nullstilt.")
        return

    print(f"Ukjent action: {args.action}", file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_link(_ctx: Context | None, args: argparse.Namespace) -> None:
    entry = fetch_json(f"/entry/{args.entry_id}/")
    cfg = load_config()
    cfg["entry_id"] = int(args.entry_id)
    cfg["manager"] = f"{entry.get('player_first_name', '')} {entry.get('player_last_name', '')}".strip()
    cfg["team_name"] = entry.get("name")
    if args.league:
        cfg["league_id"] = int(args.league)
    else:
        # Prefer first private classic league if present
        private = [
            lg
            for lg in (entry.get("leagues", {}) or {}).get("classic", [])
            if lg.get("league_type") == "x"
        ]
        if private and "league_id" not in cfg:
            cfg["league_id"] = private[0]["id"]
            print(f"Fant privat liga: {private[0]['name']} (id {private[0]['id']})")
    ensure_chip_state(cfg)
    save_config(cfg)
    print(f"Koblet til: {cfg['manager']} — «{cfg['team_name']}» (entry {cfg['entry_id']})")
    if cfg.get("league_id"):
        print(f"Mini-liga id: {cfg['league_id']}")
    print("\nNeste steg: python3 fpl_cli.py suggest")


def pull_picks(ctx: Context, entry_id: int) -> dict[str, Any] | None:
    """Fetch latest public picks for entry. Available after a GW deadline."""
    # Try next/current event first, then walk backwards
    candidates: list[int] = []
    nxt = next_event(ctx)
    cur = current_or_last_event(ctx)
    if nxt:
        candidates.append(nxt["id"])
    if cur and cur["id"] not in candidates:
        candidates.append(cur["id"])
    for e in sorted(ctx.bootstrap["events"], key=lambda x: x["id"], reverse=True):
        if e["id"] not in candidates:
            candidates.append(e["id"])
        if len(candidates) >= 6:
            break

    for eid in candidates:
        picks = fetch_json(f"/entry/{entry_id}/event/{eid}/picks/", optional=True)
        if not picks or not picks.get("picks"):
            continue
        element_ids = [p["element"] for p in sorted(picks["picks"], key=lambda x: x["position"])]
        hist = picks.get("entry_history") or {}
        bank = int(hist.get("bank") or 0)
        return {
            "entry_id": entry_id,
            "event": eid,
            "phase": "in_season",
            "element_ids": element_ids,
            "bank": bank,
            "free_transfers": 1,
            "source": "fpl_api",
            "active_chip": picks.get("active_chip"),
        }
    return None


def cmd_pull(ctx: Context, args: argparse.Namespace) -> None:
    cfg = load_config()
    if not cfg.get("entry_id"):
        print("Ingen FPL-konto koblet. Kjør: python3 fpl_cli.py link <ENTRY_ID>", file=sys.stderr)
        sys.exit(2)
    data = pull_picks(ctx, int(cfg["entry_id"]))
    if not data:
        print(
            "Fant ikke laget i FPL API ennå.\n"
            "Før GW1-deadline er laget privat. Kjør `suggest` for å lage/oppdatere lokalt lag,\n"
            "eller kjør `pull` igjen etter at en gameweek-deadline har passert."
        )
        sys.exit(0)
    # Validate ids exist
    missing = [i for i in data["element_ids"] if i not in ctx.by_id]
    if missing:
        print(f"Ukjente spiller-ider fra API: {missing}", file=sys.stderr)
        sys.exit(1)
    save_squad(data)
    squad = [ctx.by_id[i] for i in data["element_ids"]]
    print(f"Hentet lag fra FPL (GW{data['event']}), bank £{data['bank']/10:.1f}m")
    print_squad_block(ctx, squad, "Ditt lag")


def squad_from_ids(ctx: Context, element_ids: list[int]) -> list[dict[str, Any]]:
    return [ctx.by_id[i] for i in element_ids]


def cmd_show(ctx: Context, args: argparse.Namespace) -> None:
    cfg = load_config()
    data = load_squad()
    if cfg:
        print(f"Manager: {cfg.get('manager')} | Lag: {cfg.get('team_name')} | entry {cfg.get('entry_id')}")
        if cfg.get("league_id"):
            print(f"Liga:   {cfg.get('league_id')}")
    if not data:
        print("Ingen lokal tropp. Kjør: python3 fpl_cli.py suggest")
        return
    squad = squad_from_ids(ctx, data["element_ids"])
    print(f"Kilde:  {data.get('source')} | fase: {data.get('phase')} | bank £{data.get('bank', 0)/10:.1f}m")
    print_squad_block(ctx, squad, "Lagret tropp")


def cmd_suggest(ctx: Context, args: argparse.Namespace) -> None:
    cfg = load_config()
    competition = competition_pressure(cfg)
    nxt = next_event(ctx)
    print("=== FPL SUGGEST (konkurransemodus) ===\n")
    if cfg.get("entry_id"):
        print(f"Koblet lag: {cfg.get('team_name')} ({cfg.get('manager')}) — entry {cfg['entry_id']}")
    else:
        print("Ingen entry koblet ennå (valgfritt): python3 fpl_cli.py link <ENTRY_ID>")
    if nxt:
        print(f"Neste: {nxt['name']}  deadline {nxt.get('deadline_time')}")
    print(f"Differensial-trykk: {competition:.2f} (høyere = mer jakt i ligaen)")
    print(
        "EV-modell: FPL ep_next + form/PPG/xGI × FDR/hjemme-borte denne GW "
        "+ minutt-sannsynlighet + prisverdi\n"
    )

    data = load_squad()

    # Auto-pull when linked and no local squad / refresh requested
    if cfg.get("entry_id") and (data is None or args.refresh):
        pulled = pull_picks(ctx, int(cfg["entry_id"]))
        if pulled:
            save_squad(pulled)
            data = pulled
            print(f"Synket tropp fra FPL (GW{pulled['event']}).\n")

    # Preseason / first run: build full squad
    if data is None:
        style = "differential" if competition >= 0.9 else "balanced"
        print(f"Ingen lag lagret — bygger konkurranseutkast ({style})...\n")
        squad = pick_squad(ctx, style=style, competition=competition)
        bank = BUDGET - sum(p["now_cost"] for p in squad)
        xi, bench = suggest_xi(ctx, squad, competition=competition)
        capt = pick_captain(ctx, xi)
        print_squad_block(ctx, squad, "Foreslått tropp (£100m)")
        print_xi_block(ctx, xi, bench, capt)
        print(f"\nBank: £{bank/10:.1f}m")
        gw = nxt["id"] if nxt else 1
        advice = recommend_chip(ctx, cfg, gw, squad, xi, bench, capt)
        print_chip_advice(advice, cfg)
        print("\n→ Legg inn denne troppen i FPL-appen.")
        print("   Full chip-plan: python3 fpl_cli.py chips")
        payload = {
            "entry_id": cfg.get("entry_id"),
            "phase": "preseason",
            "element_ids": [p["id"] for p in squad],
            "bank": bank,
            "free_transfers": 99,
            "source": "suggest_draft",
            "style": style,
        }
        if args.apply or args.auto_save:
            save_squad(payload)
            print(f"Lagret lokalt i {SQUAD_PATH.name} (brukes for ukentlige bytter).")
        else:
            save_squad(payload)  # auto-save on first suggest for minimal friction
            print(f"Lagret lokalt i {SQUAD_PATH.name}. Kjør `suggest` igjen senere for bytter.")
        return

    # In-season / ongoing: recommend transfers for THIS squad
    squad = squad_from_ids(ctx, data["element_ids"])
    bank = int(data.get("bank") or 0)
    ft = resolve_free_transfers(data, cfg)
    print_squad_block(ctx, squad, "Ditt lag (grunnlag)")
    print(f"\nBank: £{bank/10:.1f}m | Gratis bytter (antatt): {ft if ft < 90 else 'ubegrenset (preseason)'}")

    if ft >= 90:
        # Still preseason: allow full rebuild suggestion vs current
        style = "differential" if competition >= 0.9 else "balanced"
        alt = pick_squad(ctx, style=style, competition=competition)
        print("\n=== Preseason: alternativt konkurranseutkast ===")
        print("(Ubegrensede bytter — du kan bytte fritt i appen til GW1)")
        print_squad_block(ctx, alt, "Alternativ tropp")
        xi, bench = suggest_xi(ctx, alt, competition=competition)
        capt = pick_captain(ctx, xi)
        print_xi_block(ctx, xi, bench, capt)
        gw = nxt["id"] if nxt else 1
        advice = recommend_chip(ctx, cfg, gw, alt, xi, bench, capt)
        print_chip_advice(advice, cfg)
        if args.apply:
            bank2 = BUDGET - sum(p["now_cost"] for p in alt)
            save_squad(
                {
                    "entry_id": cfg.get("entry_id"),
                    "phase": "preseason",
                    "element_ids": [p["id"] for p in alt],
                    "bank": bank2,
                    "free_transfers": 99,
                    "source": "suggest_draft",
                    "style": style,
                }
            )
            print(f"\nOppdatert lokal tropp → {SQUAD_PATH.name}")
        return

    plan = choose_transfer_plan(ctx, squad, bank, min(ft, 2), competition=competition)
    print("\n=== Anbefalte endringer ===")
    if not plan["moves"]:
        print("Ingen bytter. Behold troppen.")
    else:
        for i, m in enumerate(plan["moves"], 1):
            must = " [PRIORITERT — risiko/skade]" if m.get("must") else ""
            print(
                f"{i}. UT  {player_label(ctx, m['out'])}  [{m.get('out_fx','')}]\n"
                f"   INN {player_label(ctx, m['in'])}  [{m.get('in_fx','')}]  "
                f"(ΔEV {m['gain']:+.1f} poeng, Δ£ {m['cost_delta']/10:+.1f}m){must}"
            )
        if plan["hit"]:
            print(f"\nHits: −{plan['hit']} poeng")
        print(f"Forventet nettogevinst (poeng): {plan['net']:+.1f}")

    new_squad = plan["squad"]
    new_bank = plan["bank"]
    xi, bench = suggest_xi(ctx, new_squad, competition=competition)
    capt = pick_captain(ctx, xi)
    advice = recommend_chip(
        ctx, cfg, nxt["id"] if nxt else 1, new_squad, xi, bench, capt
    )
    use_tc = bool(advice["chosen"] and advice["chosen"]["chip"] == "3xc")
    print_xi_block(ctx, xi, bench, capt, triple=use_tc)
    print(f"\nBank etter bytter: £{new_bank/10:.1f}m")
    print_chip_advice(advice, cfg)

    if args.apply and plan["moves"]:
        save_squad(
            {
                "entry_id": cfg.get("entry_id"),
                "phase": "in_season",
                "element_ids": [p["id"] for p in new_squad],
                "bank": new_bank,
                "free_transfers": 1,
                "source": "suggest_apply",
                "last_moves": [
                    {"out": m["out"]["id"], "in": m["in"]["id"]} for m in plan["moves"]
                ],
            }
        )
        print(f"\nLokal tropp oppdatert med bytter → {SQUAD_PATH.name}")
        print("Gjør de samme bytene i FPL-appen.")
    elif plan["moves"]:
        print("\nTips: kjør `python3 fpl_cli.py suggest --apply` når du har gjort bytene,")
        print("eller `python3 fpl_cli.py pull` etter deadline for å synke fra FPL.")
    if advice.get("chosen"):
        print(
            f"Hvis du spiller chip: python3 fpl_cli.py chips use {advice['chosen']['chip']}"
        )


def cmd_rank(ctx: Context, args: argparse.Namespace) -> None:
    players = [p for p in ctx.players if available(p)]
    if args.pos:
        want = args.pos.upper()
        pos_id = next((i for i, n in ctx.positions.items() if n == want), None)
        if pos_id is None:
            print(f"Ukjent posisjon: {args.pos}", file=sys.stderr)
            sys.exit(2)
        players = [p for p in players if p["element_type"] == pos_id]
    if args.max_own is not None:
        players = [p for p in players if fnum(p.get("selected_by_percent")) <= args.max_own]
    competition = 1.0 if args.differential else 0.0
    ranked = sorted(
        players,
        key=lambda p: week_score(ctx, p, competition=competition),
        reverse=True,
    )[: args.top]
    print(f"{'Spiller':<14} Pos Lag Pris   EP  Own%  FDR{args.next}  Score")
    print("-" * 70)
    for p in ranked:
        print(
            f"{player_label(ctx, p)}  {fnum(p.get('ep_next')):4.1f} "
            f"{fnum(p.get('selected_by_percent')):5.1f}  "
            f"{avg_fdr(ctx, p['team'], args.next):4.2f}  "
            f"{week_score(ctx, p, competition=competition):5.1f}"
        )


def cmd_fixtures(ctx: Context, args: argparse.Namespace) -> None:
    teams = sorted(ctx.teams.values(), key=lambda t: avg_fdr(ctx, t["id"], args.next))
    print(f"FDR neste {args.next} GW (lavest = lettest)\n")
    for t in teams:
        rows = upcoming_fdr(ctx, t["id"], args.next)
        run = " ".join(f"{'H' if h else 'A'}{opp}({fdr})" for _, fdr, opp, h in rows)
        print(f"{t['short_name']:<4} {avg_fdr(ctx, t['id'], args.next):5.2f}  {run}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="FPL-coach: foreslå lag og ukentlige bytter for ditt lag",
        epilog="Hovedflyt: link <id> → suggest → (hver uke) suggest [--apply] → pull etter deadline",
    )
    sub = parser.add_subparsers(dest="cmd", required=False)

    p_link = sub.add_parser("link", help="Koble FPL-lag (entry id fra URL)")
    p_link.add_argument("entry_id", type=int, help="Tall i fantasy.premierleague.com/entry/XXXXX/")
    p_link.add_argument("--league", type=int, default=None, help="Mini-liga id (valgfritt)")
    p_link.set_defaults(func=cmd_link, needs_ctx=False)

    p_sug = sub.add_parser("suggest", help="Hovedkommando: lagforslag / ukentlige bytter")
    p_sug.add_argument("--apply", action="store_true", help="Lagre foreslåtte bytter lokalt")
    p_sug.add_argument("--refresh", action="store_true", help="Hent tropp fra FPL på nytt")
    p_sug.add_argument("--auto-save", action="store_true", help=argparse.SUPPRESS)
    p_sug.set_defaults(func=cmd_suggest, needs_ctx=True)

    p_pull = sub.add_parser("pull", help="Synk tropp fra FPL (etter GW-deadline)")
    p_pull.set_defaults(func=cmd_pull, needs_ctx=True)

    p_show = sub.add_parser("show", help="Vis kobling og lagret tropp")
    p_show.set_defaults(func=cmd_show, needs_ctx=True)

    p_chips = sub.add_parser("chips", help="Chip-plan + ukentlig anbefaling (EV)")
    p_chips.add_argument(
        "action",
        nargs="?",
        default="plan",
        choices=["plan", "use", "reset"],
        help="plan (standard) | use | reset",
    )
    p_chips.add_argument(
        "chip",
        nargs="?",
        default=None,
        help="Ved use: 3xc|bboost|freehit|wildcard (eller tc/bb/fh/wc)",
    )
    p_chips.add_argument("--gw", type=int, default=None, help="Gameweek for chips use")
    p_chips.set_defaults(func=cmd_chips, needs_ctx=True)

    p_rank = sub.add_parser("rank", help="(Avansert) spillerranking")
    p_rank.add_argument("--top", type=int, default=20)
    p_rank.add_argument("--pos", type=str, default=None)
    p_rank.add_argument("--max-own", type=float, default=None)
    p_rank.add_argument("--next", type=int, default=6)
    p_rank.add_argument("--differential", action="store_true")
    p_rank.set_defaults(func=cmd_rank, needs_ctx=True)

    p_fx = sub.add_parser("fixtures", help="(Avansert) fixture difficulty")
    p_fx.add_argument("--next", type=int, default=6)
    p_fx.set_defaults(func=cmd_fixtures, needs_ctx=True)

    return parser


def interactive_menu() -> None:
    """Phone-friendly menu (Python Code Pad / Pyto / Pydroid osv.)."""
    print("=== FPL Coach (telefonmeny) ===")
    print("Trenger nett. Første gang: velg 1 for å koble laget ditt.\n")
    while True:
        print(
            "1) Koble FPL-lag (entry-id)\n"
            "2) Suggest — lag / bytter / kaptein / chips\n"
            "3) Suggest + lagre bytter (--apply)\n"
            "4) Chip-plan\n"
            "5) Vis lagret tropp\n"
            "6) Synk fra FPL (pull)\n"
            "7) Fixtures (neste 6 GW)\n"
            "0) Avslutt"
        )
        choice = input("\nVelg: ").strip()
        if choice in {"0", "q", "quit", "exit"}:
            print("Ferdig.")
            return
        try:
            if choice == "1":
                raw = input("Entry-id (tall fra /entry/1234567/): ").strip()
                league = input("Mini-liga id (valgfritt, Enter for hopp over): ").strip()
                ns = argparse.Namespace(
                    entry_id=int(raw),
                    league=int(league) if league else None,
                )
                cmd_link(None, ns)
            elif choice == "2":
                cmd_suggest(
                    load_context(),
                    argparse.Namespace(apply=False, refresh=False, auto_save=False),
                )
            elif choice == "3":
                cmd_suggest(
                    load_context(),
                    argparse.Namespace(apply=True, refresh=False, auto_save=False),
                )
            elif choice == "4":
                cmd_chips(load_context(), argparse.Namespace(action="plan", chip=None, gw=None))
            elif choice == "5":
                cmd_show(load_context(), argparse.Namespace())
            elif choice == "6":
                cmd_pull(load_context(), argparse.Namespace())
            elif choice == "7":
                cmd_fixtures(load_context(), argparse.Namespace(next=6))
            else:
                print("Ugyldig valg.\n")
                continue
        except Exception as exc:  # noqa: BLE001 — show errors clearly on phone
            print(f"\nFeil: {exc}\n")
        print()


def main() -> None:
    # No args (typical on phone apps) → interactive menu
    if len(sys.argv) <= 1:
        interactive_menu()
        return
    parser = build_parser()
    args = parser.parse_args()
    if not getattr(args, "cmd", None):
        interactive_menu()
        return
    needs_ctx = getattr(args, "needs_ctx", True)
    ctx = load_context() if needs_ctx else None
    if args.cmd == "link":
        cmd_link(ctx, args)
    else:
        args.func(ctx, args)


if __name__ == "__main__":
    main()
