"use client";

import { useMemo, useState } from "react";

import ChallengeRandomizer from "./ChallengeRandomizer";
import IPLGame from "./IPLGame";
import PlayerPool from "./PlayerPool";
import PlayingXI from "./PlayingXI";

import { getRandomPitch } from "@/lib/ipl-challenge/pitches";
import { canAddPlayer, validateXI } from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLChallenge,
  IPLGameState,
  IPLPlayer,
  PitchProfile,
  PlayerRole,
} from "@/types/ipl";

const MAX_PLAYERS = 11;

type RespinType = "team" | "season";

export default function XISelectionGame() {
  const [gameChallenge, setGameChallenge] = useState<IPLChallenge | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<IPLChallenge | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState<IPLPlayer[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<IPLPlayer[]>([]);
  const [pitch, setPitch] = useState<PitchProfile | null>(null);
  const [gameState, setGameState] = useState<IPLGameState>("challenge");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | PlayerRole>("ALL");
  const [randomizerKey, setRandomizerKey] = useState(0);
  const [respinLoading, setRespinLoading] = useState<RespinType | null>(null);
  const [teamRespinUsed, setTeamRespinUsed] = useState(false);
  const [seasonRespinUsed, setSeasonRespinUsed] = useState(false);

  function resetPlayerPool(challenge: IPLChallenge, players: IPLPlayer[]) {
    setCurrentChallenge(challenge);
    setCurrentPlayers(players);
    setSearchQuery("");
    setRoleFilter("ALL");
    setGameState("selection");
  }

  function handleChallengeReady(challenge: IPLChallenge, players: IPLPlayer[]) {
    const startingNewXI = selectedPlayers.length === 0;

    setGameChallenge(challenge);
    if (startingNewXI) {
      setTeamRespinUsed(false);
      setSeasonRespinUsed(false);
      setPitch(getRandomPitch());
    }
    resetPlayerPool(challenge, players);
  }

  async function fetchPlayers(teamSeasonId: string): Promise<IPLPlayer[]> {
    const response = await fetch(
      `/api/ipl/team-season/${encodeURIComponent(teamSeasonId)}/players`,
      { method: "GET", cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("Unable to load available players.");
    }

    const data = await response.json();

    if (!Array.isArray(data?.players)) {
      throw new Error("Invalid player data received.");
    }

    return data.players;
  }

  async function respin(type: RespinType) {
    if (!gameChallenge || respinLoading) return;
    if (type === "team" && teamRespinUsed) return;
    if (type === "season" && seasonRespinUsed) return;

    setRespinLoading(type);

    try {
      const endpoint =
        type === "team"
          ? `/api/ipl/random/team?seasonId=${encodeURIComponent(gameChallenge.season.id)}`
          : `/api/ipl/random/season?teamId=${encodeURIComponent(gameChallenge.team.id)}`;

      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Unable to respin the ${type}.`);
      }

      const data = await response.json();
      let nextChallenge: IPLChallenge;

      if (type === "team") {
        if (!data?.team?.id || !data?.teamSeasonId) {
          throw new Error("Invalid team data received.");
        }

        nextChallenge = {
          teamSeasonId: data.teamSeasonId,
          team: data.team,
          season: gameChallenge.season,
        };
      } else {
        if (!data?.season?.id || !data.season.teamSeasonId) {
          throw new Error("Invalid season data received.");
        }

        nextChallenge = {
          teamSeasonId: data.season.teamSeasonId,
          team: gameChallenge.team,
          season: {
            id: data.season.id,
            season: data.season.season,
            startYear: data.season.startYear,
          },
        };
      }

      const players = await fetchPlayers(nextChallenge.teamSeasonId);

      // The latest challenge is authoritative for the eventual game.
      setGameChallenge(nextChallenge);
      if (type === "team") setTeamRespinUsed(true);
      if (type === "season") setSeasonRespinUsed(true);
      resetPlayerPool(nextChallenge, players);
    } catch (error) {
      console.error(`IPL ${type} respin failed:`, error);
    } finally {
      setRespinLoading(null);
    }
  }

  function handleSelectPlayer(player: IPLPlayer) {
    if (!canAddPlayer(selectedPlayers, player)) return;

    const nextPlayers = [...selectedPlayers, player];
    setSelectedPlayers(nextPlayers);
    setCurrentChallenge(null);
    setCurrentPlayers([]);
    setSearchQuery("");
    setRoleFilter("ALL");
    setRandomizerKey((current) => current + 1);

    if (nextPlayers.length === MAX_PLAYERS && validateXI(nextPlayers).valid) {
      setGameState("playing");
      return;
    }

    setGameState("challenge");
  }

  function handleRemovePlayer(playerId: string) {
    const nextPlayers = selectedPlayers.filter((player) => player.id !== playerId);

    setSelectedPlayers(nextPlayers);
    setCurrentChallenge(null);
    setCurrentPlayers([]);
    setSearchQuery("");
    setRoleFilter("ALL");
    setRandomizerKey((current) => current + 1);

    if (nextPlayers.length === 0) {
      setGameChallenge(null);
      setTeamRespinUsed(false);
      setSeasonRespinUsed(false);
      setPitch(null);
    }

    setGameState("challenge");
  }

  const validation = useMemo(() => validateXI(selectedPlayers), [selectedPlayers]);

if (gameState === "playing") {
  if (!gameChallenge) {
    return null;
  }

  return (
    <IPLGame
      challenge={gameChallenge}
      selectedPlayers={selectedPlayers}
      onBackToSelection={() =>
        setGameState("challenge")
      }
    />
  );
}

  const building = selectedPlayers.length < MAX_PLAYERS;
  const hasChallenge = Boolean(currentChallenge && gameState === "selection");

  return (
    <main className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Compact challenge bar — stays fixed while the player pool changes. */}
      <div className="shrink-0 pb-3">
        {!currentChallenge && building && (
          <ChallengeRandomizer
            key={randomizerKey}
            onChallengeReady={handleChallengeReady}
          />
        )}

        {currentChallenge && building && (
          <ChallengeBar
            challenge={currentChallenge}
            teamRespinUsed={teamRespinUsed}
            seasonRespinUsed={seasonRespinUsed}
            respinLoading={respinLoading}
            onRespinTeam={() => respin("team")}
            onRespinSeason={() => respin("season")}
          />
        )}
      </div>

      {/* The two-column work area has a fixed height. Only PlayerPool scrolls. */}
      <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.82fr)]">
        <section className="min-h-0 overflow-hidden">
          {hasChallenge ? (
            <PlayerPool
              challenge={currentChallenge!}
              players={currentPlayers}
              selectedPlayers={selectedPlayers}
              searchQuery={searchQuery}
              roleFilter={roleFilter}
              onSearchChange={setSearchQuery}
              onRoleFilterChange={setRoleFilter}
              onSelectPlayer={handleSelectPlayer}
              canSelectPlayer={(player) => canAddPlayer(selectedPlayers, player)}
            />
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-black/5 px-6 text-center">
              <div>
                <p className="text-sm font-bold text-[var(--muted)]">
                  {selectedPlayers.length === 0 ? "Spin to start building your XI" : "Spin for the next player pool"}
                </p>
                {selectedPlayers.length > 0 && (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {selectedPlayers.length} / {MAX_PLAYERS} players selected
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedPlayers.length === MAX_PLAYERS && !validation.valid && (
            <section className="card p-4">
              {validation.errors.map((error) => (
                <p key={error} className="text-sm text-red-400">
                  {error}
                </p>
              ))}
            </section>
          )}
        </section>

        <div className="min-h-0 overflow-hidden">
          <PlayingXI
            players={selectedPlayers}
            pitch={pitch}
            onRemovePlayer={handleRemovePlayer}
          />
        </div>
      </section>
    </main>
  );
}

function ChallengeBar({
  challenge,
  teamRespinUsed,
  seasonRespinUsed,
  respinLoading,
  onRespinTeam,
  onRespinSeason,
}: {
  challenge: IPLChallenge;
  teamRespinUsed: boolean;
  seasonRespinUsed: boolean;
  respinLoading: RespinType | null;
  onRespinTeam: () => void;
  onRespinSeason: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 px-2.5 py-2 shadow-sm backdrop-blur">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <ChallengeValue label="Team" value={challenge.team.name} />
          <ChallengeValue label="Season" value={challenge.season.season} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--line)] pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
          <button
            type="button"
            onClick={onRespinTeam}
            disabled={respinLoading !== null || teamRespinUsed}
            className="h-8 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 text-[10px] font-black uppercase tracking-wide text-amber-300 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {respinLoading === "team" ? "Rolling…" : teamRespinUsed ? "Team used" : "↻ Team"}
          </button>
          <button
            type="button"
            onClick={onRespinSeason}
            disabled={respinLoading !== null || seasonRespinUsed}
            className="h-8 rounded-lg border border-fuchsia-400/30 bg-fuchsia-400/10 px-2.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-300 transition hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {respinLoading === "season" ? "Rolling…" : seasonRespinUsed ? "Season used" : "↻ Season"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-black/10 px-2.5 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black">{value}</p>
    </div>
  );
}
