#!/usr/bin/env python3
"""FPL 2026/27 CLI — ranking, fixtures, draft and weekly decisions.

Uses the public Fantasy Premier League API. No API key required.
Requires Python 3.10+ and network access.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

API = "https://fantasy.premierleague.com/api"
BUDGET = 1000  # £100.0m in tenths
SQUAD_LIMITS = {1: 2, 2: 5, 3: 5, 4: 3}  # GKP DEF MID FWD
MAX_PER_CLUB = 3


def fetch_json(path: str) -> Any:
    url = f"{API}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "fpl-prosess/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
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


def reliable_xgi90(p: dict[str, Any]) -> float:
    """Per-90 xGI is noisy with tiny samples — require meaningful minutes."""
    minutes = int(p.get("minutes") or 0)
    if minutes < 600:
        # Scale season xGI gently so proven scorers still surface preseason
        return fnum(p.get("expected_goal_involvements")) / 15.0
    return fnum(p.get("expected_goal_involvements_per_90"))


def likely_starter_bonus(p: dict[str, Any]) -> float:
    """Proxy for minutes risk before the season has form data."""
    minutes = int(p.get("minutes") or 0)
    starts = int(p.get("starts") or 0)
    own = fnum(p.get("selected_by_percent"))
    ep = fnum(p.get("ep_next"))
    bonus = 0.0
    if starts >= 20 or minutes >= 1800:
        bonus += 3.0
    elif starts >= 10 or minutes >= 900:
        bonus += 1.8
    elif starts >= 5 or minutes >= 450:
        bonus += 0.6
    else:
        bonus -= 2.5  # avoid pure fringe/bench noise in drafts
    # Ownership is a weak but useful "will play" signal preseason
    if own >= 10:
        bonus += 1.2
    elif own >= 3:
        bonus += 0.5
    if ep >= 3.0:
        bonus += 1.5
    elif ep <= 1.0 and own < 5:
        bonus -= 1.5
    return bonus


def score_player(p: dict[str, Any], weights: dict[str, float] | None = None) -> float:
    """Composite score for preseason + in-season ranking."""
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
    return (
        w["ep"] * ep
        + w["form"] * form
        + w["xgi90"] * xgi90
        + w["value"] * value * 10
        + w.get("starter", 1.0) * likely_starter_bonus(p)
        - w["own_penalty"] * max(own - 20, 0) / 10
    )


def upcoming_fdr(ctx: Context, team_id: int, next_n: int = 6) -> list[tuple[int, int, str, bool]]:
    """Return list of (event, fdr, opponent_short, is_home) for next N fixtures."""
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


def cmd_rank(ctx: Context, args: argparse.Namespace) -> None:
    players = [p for p in ctx.players if available(p)]
    if args.pos:
        want = args.pos.upper()
        pos_id = next((i for i, n in ctx.positions.items() if n == want), None)
        if pos_id is None:
            print(f"Ukjent posisjon: {args.pos}. Bruk GKP/DEF/MID/FWD", file=sys.stderr)
            sys.exit(2)
        players = [p for p in players if p["element_type"] == pos_id]
    if args.max_own is not None:
        players = [p for p in players if fnum(p.get("selected_by_percent")) <= args.max_own]
    if args.max_price is not None:
        players = [p for p in players if p["now_cost"] <= int(args.max_price * 10)]

    weights = None
    if args.differential:
        weights = {
            "ep": 3.0,
            "form": 1.5,
            "xgi90": 2.2,
            "value": 1.2,
            "own_penalty": 1.5,
            "starter": 1.0,
        }

    ranked = sorted(players, key=lambda p: score_player(p, weights), reverse=True)[: args.top]
    print(f"{'Spiller':<14} Pos Lag Pris   EP  Form  xGI90  Own%  FDR{args.next}  Score")
    print("-" * 78)
    for p in ranked:
        fdr = avg_fdr(ctx, p["team"], args.next)
        print(
            f"{player_label(ctx, p)}  "
            f"{fnum(p.get('ep_next')):4.1f} {fnum(p.get('form')):5.1f} "
            f"{reliable_xgi90(p):5.2f} "
            f"{fnum(p.get('selected_by_percent')):5.1f}  "
            f"{fdr:4.2f}  {score_player(p, weights):5.1f}"
        )


def cmd_fixtures(ctx: Context, args: argparse.Namespace) -> None:
    teams = sorted(ctx.teams.values(), key=lambda t: avg_fdr(ctx, t["id"], args.next))
    print(f"Fixture difficulty (snitt FDR) neste {args.next} GW — lavest = lettest\n")
    print(f"{'Lag':<4} {'Snitt':>5}  Run")
    print("-" * 60)
    for t in teams:
        rows = upcoming_fdr(ctx, t["id"], args.next)
        run = " ".join(f"{'H' if h else 'A'}{opp}({fdr})" for _, fdr, opp, h in rows)
        print(f"{t['short_name']:<4} {avg_fdr(ctx, t['id'], args.next):5.2f}  {run}")


def cmd_value(ctx: Context, args: argparse.Namespace) -> None:
    print("Verdi: EP_next / pris (kun spillere som kan velges)\n")
    for pos_id, pos_name in sorted(ctx.positions.items()):
        pool = [p for p in ctx.players if p["element_type"] == pos_id and available(p)]
        pool.sort(
            key=lambda p: fnum(p.get("ep_next")) / max(p["now_cost"] / 10, 3.5),
            reverse=True,
        )
        print(f"=== {pos_name} ===")
        for p in pool[: args.top]:
            value = fnum(p.get("ep_next")) / (p["now_cost"] / 10)
            print(
                f"  {player_label(ctx, p)}  EP {fnum(p.get('ep_next')):4.1f}  "
                f"verdi {value:4.2f}  own {fnum(p.get('selected_by_percent')):5.1f}%"
            )
        print()


def pick_squad(ctx: Context, style: str = "balanced") -> list[dict[str, Any]]:
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
        return score_player(p, weights) + (3.5 - avg_fdr(ctx, p["team"], 6)) * 0.9

    by_pos: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: [], 4: []}
    for p in ctx.players:
        if available(p):
            by_pos[p["element_type"]].append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=key, reverse=True)

    squad: list[dict[str, Any]] = []
    spend = 0
    club_count: dict[int, int] = {}
    counts = {1: 0, 2: 0, 3: 0, 4: 0}
    gk_teams: set[int] = set()
    floor = 40  # £4.0m

    def slots_left_after_one() -> int:
        return 15 - len(squad) - 1

    def max_affordable() -> int:
        return BUDGET - spend - slots_left_after_one() * floor

    def can_add(p: dict[str, Any]) -> bool:
        if counts[p["element_type"]] >= SQUAD_LIMITS[p["element_type"]]:
            return False
        if club_count.get(p["team"], 0) >= MAX_PER_CLUB:
            return False
        if p["element_type"] == 1 and p["team"] in gk_teams:
            return False
        if p["now_cost"] > max_affordable():
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

    # Premium seats first, then fill remaining by best affordable score
    seat_order = (
        [4] * SQUAD_LIMITS[4]
        + [3] * SQUAD_LIMITS[3]
        + [2] * SQUAD_LIMITS[2]
        + [1] * SQUAD_LIMITS[1]
    )
    for pos in seat_order:
        picked = None
        for p in by_pos[pos]:
            if can_add(p):
                picked = p
                break
        if picked is None:
            # fallback: cheapest available for position
            for p in sorted(by_pos[pos], key=lambda x: (x["now_cost"], -key(x))):
                if can_add(p):
                    picked = p
                    break
        if picked is None:
            continue
        add(picked)

    # Last-resort fill if any seat empty (should be rare)
    guard = 0
    while len(squad) < 15 and guard < 30:
        guard += 1
        missing = next((pos for pos, need in SQUAD_LIMITS.items() if counts[pos] < need), None)
        if missing is None:
            break
        picked = None
        for p in sorted(by_pos[missing], key=lambda x: (x["now_cost"], -key(x))):
            # temporarily ignore score; force cheapest legal
            if counts[p["element_type"]] >= SQUAD_LIMITS[p["element_type"]]:
                continue
            if club_count.get(p["team"], 0) >= MAX_PER_CLUB:
                continue
            if p["element_type"] == 1 and p["team"] in gk_teams:
                continue
            if spend + p["now_cost"] > BUDGET:
                continue
            if any(s["id"] == p["id"] for s in squad):
                continue
            picked = p
            break
        if picked is None:
            # free money: downgrade most expensive non-missing player
            candidates = [
                (i, p)
                for i, p in enumerate(squad)
                if p["element_type"] != missing and p["now_cost"] > floor
            ]
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

    # Spend leftover ITB on upgrades
    itb = BUDGET - spend
    if itb >= 5:
        squad_ids = {p["id"] for p in squad}
        improved = True
        while improved and itb >= 5:
            improved = False
            for i, cur in enumerate(list(squad)):
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
                    gain = key(p) - key(cur)
                    if gain > best_gain:
                        best_gain = gain
                        best = p
                if best and best_gain > 0.35:
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
                    improved = True
                    break

    return squad


def suggest_xi(ctx: Context, squad: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    def key(p: dict[str, Any]) -> float:
        return score_player(p) + (3.5 - avg_fdr(ctx, p["team"], 4)) * 1.0

    by_pos: dict[int, list[dict[str, Any]]] = {1: [], 2: [], 3: [], 4: []}
    for p in squad:
        by_pos[p["element_type"]].append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=key, reverse=True)

    xi: list[dict[str, Any]] = []
    # GK
    xi.append(by_pos[1][0])
    # Minimums: 3 DEF, 2 MID, 1 FWD
    xi.extend(by_pos[2][:3])
    xi.extend(by_pos[3][:2])
    xi.extend(by_pos[4][:1])
    chosen = {p["id"] for p in xi}
    rest = sorted((p for p in squad if p["id"] not in chosen), key=key, reverse=True)
    # Fill to 11 with best remaining outfield (respect formation limits: max 5 def/mid, max 3 fwd)
    def_count = 3
    mid_count = 2
    fwd_count = 1
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
        xi.append(p)
        if pos == 2:
            def_count += 1
        elif pos == 3:
            mid_count += 1
        elif pos == 4:
            fwd_count += 1
    xi_ids = {p["id"] for p in xi}
    bench = sorted((p for p in squad if p["id"] not in xi_ids), key=key, reverse=True)
    # Bench order: outfield first by quality, GK last typically as slot 4 — keep GK at end
    outfield_bench = [p for p in bench if p["element_type"] != 1]
    gk_bench = [p for p in bench if p["element_type"] == 1]
    bench = outfield_bench + gk_bench
    return xi, bench


def cmd_draft(ctx: Context, args: argparse.Namespace) -> None:
    squad = pick_squad(ctx, style=args.style)
    spend = sum(p["now_cost"] for p in squad) / 10
    xi, bench = suggest_xi(ctx, squad)
    print(f"Draft-stil: {args.style}  |  Brukt: £{spend:.1f}m  |  ITB: £{100 - spend:.1f}m\n")
    print("=== Foreslått tropp ===")
    for pos_id in (1, 2, 3, 4):
        print(f"\n{ctx.positions[pos_id]}:")
        for p in sorted(
            (x for x in squad if x["element_type"] == pos_id),
            key=lambda x: x["now_cost"],
            reverse=True,
        ):
            own = fnum(p.get("selected_by_percent"))
            print(
                f"  {player_label(ctx, p)}  EP {fnum(p.get('ep_next')):4.1f}  "
                f"own {own:5.1f}%  FDR6 {avg_fdr(ctx, p['team'], 6):.2f}"
            )
    print("\n=== Foreslått XI ===")
    for p in xi:
        print(f"  {player_label(ctx, p)}")
    capt = max(
        xi,
        key=lambda p: fnum(p.get("ep_next")) * 2
        + score_player(p) * 0.15
        + (3.5 - avg_fdr(ctx, p["team"], 1)),
    )
    print(f"\nKaptein-forslag GW: {capt['web_name']}")
    print("\n=== Benk (rekkefølge) ===")
    for i, p in enumerate(bench, 1):
        print(f"  {i}. {player_label(ctx, p)}")
    print(
        "\nDette er et utgangspunkt — kjør også `rank` / `fixtures` og juster manuelt "
        "før du lagrer i FPL-appen."
    )


def cmd_weekly(ctx: Context, args: argparse.Namespace) -> None:
    events = ctx.bootstrap["events"]
    current = next((e for e in events if e.get("is_current")), None)
    nxt = next((e for e in events if e.get("is_next")), None)
    print("=== Ukesrapport ===\n")
    if current:
        print(f"Pågående: {current['name']}  ferdig={current.get('finished')}")
    if nxt:
        print(f"Neste:    {nxt['name']}  deadline={nxt.get('deadline_time')}")
    print()

    # Price / transfer movers
    players = [p for p in ctx.players if available(p)]
    risers = sorted(players, key=lambda p: p.get("transfers_in_event") or 0, reverse=True)[:8]
    fallers = sorted(players, key=lambda p: p.get("transfers_out_event") or 0, reverse=True)[:8]
    print("Mest hentet (denne GW):")
    for p in risers:
        print(
            f"  {player_label(ctx, p)}  +{p.get('transfers_in_event', 0):,}  "
            f"Δ£ {p.get('cost_change_event', 0) / 10:+.1f}"
        )
    print("\nMest solgt (denne GW):")
    for p in fallers:
        print(
            f"  {player_label(ctx, p)}  -{p.get('transfers_out_event', 0):,}  "
            f"Δ£ {p.get('cost_change_event', 0) / 10:+.1f}"
        )

    print("\nBeste EP neste GW (kandidater til XI/kaptein):")
    for p in sorted(players, key=lambda p: fnum(p.get("ep_next")), reverse=True)[:12]:
        print(
            f"  {player_label(ctx, p)}  EP {fnum(p.get('ep_next')):4.1f}  "
            f"own {fnum(p.get('selected_by_percent')):5.1f}%"
        )

    print("\nLetteste lag-runs (neste 4 GW) — vurder cover:")
    teams = sorted(ctx.teams.values(), key=lambda t: avg_fdr(ctx, t["id"], 4))[:8]
    for t in teams:
        print(f"  {t['short_name']}: snitt FDR {avg_fdr(ctx, t['id'], 4):.2f}")

    print("\nNeste steg: sjekk nyheter → sett XI → bytter → kaptein (se uke-sjekkliste.md)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="FPL 2026/27 beslutningsstøtte (offisiell API)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_rank = sub.add_parser("rank", help="Ranger spillere")
    p_rank.add_argument("--top", type=int, default=20)
    p_rank.add_argument("--pos", type=str, default=None, help="GKP/DEF/MID/FWD")
    p_rank.add_argument("--max-own", type=float, default=None, help="Maks eierskap %")
    p_rank.add_argument("--max-price", type=float, default=None, help="Maks pris i millioner")
    p_rank.add_argument("--next", type=int, default=6, help="FDR-vindu")
    p_rank.add_argument("--differential", action="store_true")
    p_rank.set_defaults(func=cmd_rank)

    p_fx = sub.add_parser("fixtures", help="Fixture difficulty per lag")
    p_fx.add_argument("--next", type=int, default=6)
    p_fx.set_defaults(func=cmd_fixtures)

    p_val = sub.add_parser("value", help="Verdi per posisjon (EP/pris)")
    p_val.add_argument("--top", type=int, default=8)
    p_val.set_defaults(func=cmd_value)

    p_draft = sub.add_parser("draft", help="Foreslå tropp innenfor £100m")
    p_draft.add_argument(
        "--style",
        choices=["balanced", "template", "differential"],
        default="balanced",
    )
    p_draft.set_defaults(func=cmd_draft)

    p_week = sub.add_parser("weekly", help="Ukesrapport før deadline")
    p_week.set_defaults(func=cmd_weekly)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    ctx = load_context()
    args.func(ctx, args)


if __name__ == "__main__":
    main()
