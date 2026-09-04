"use client";

import {
  Search,
  RefreshCw,
  Users,
  Trophy,
  X,
  Plus,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import XISelectionGame from "@/components/ipl/XISelectionGame";

export default function IPLChallengePage() {
  return <XISelectionGame />;
}

type Team = {
  id: string;
  name: string;
};

type Season = {
  id: string;
  season: string;
  startYear: number;
};

type Challenge = {
  teamSeasonId: string;
  team: Team;
  season: Season;
};

type Player = {
  statisticId: string;
  playerId: string;
  name: string;

  matches: number;
  battingInnings: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  highestScore: number;
  dismissals: number;

  bowlingInnings: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
};

type PlayerResponse = {
  players: Player[];
  total: number;
};

function getPlayerRole(
  player: Player
) {
  const hasBatting =
    player.runs > 150;

  const hasBowling =
    player.wickets >= 5;

  if (
    hasBatting &&
    hasBowling
  ) {
    return "ALL";
  }

  if (hasBowling) {
    return "BOWL";
  }

  return "BAT";
}

// export default function IPLChallengePage() {
//   const [
//     challenge,
//     setChallenge,
//   ] =
//     useState<Challenge | null>(
//       null
//     );

//   const [
//     players,
//     setPlayers,
//   ] =
//     useState<Player[]>([]);

//   const [
//     selectedPlayers,
//     setSelectedPlayers,
//   ] =
//     useState<Player[]>([]);

//   const [
//     search,
//     setSearch,
//   ] =
//     useState("");

//   const [
//     roleFilter,
//     setRoleFilter,
//   ] =
//     useState<
//       "ALL" | "BAT" | "BOWL" | "ALL_ROUNDER"
//     >("ALL");

//   const [
//     loadingChallenge,
//     setLoadingChallenge,
//   ] =
//     useState(true);

//   const [
//     loadingPlayers,
//     setLoadingPlayers,
//   ] =
//     useState(false);

//   const [
//     spinningTeam,
//     setSpinningTeam,
//   ] =
//     useState(false);

//   const [
//     spinningSeason,
//     setSpinningSeason,
//   ] =
//     useState(false);

//   const [
//     rollingTeamName,
//     setRollingTeamName,
//   ] =
//     useState("");

//   const [
//     rollingSeason,
//     setRollingSeason,
//   ] =
//     useState("");

//   const loadPlayers =
//     useCallback(
//       async (
//         teamSeasonId: string
//       ) => {
//         try {
//           setLoadingPlayers(
//             true
//           );

//           const response =
//             await fetch(
//               `/api/ipl/team-seasons/${teamSeasonId}/players`
//             );

//           if (
//             !response.ok
//           ) {
//             throw new Error(
//               "Unable to load players."
//             );
//           }

//           const data:
//             PlayerResponse =
//             await response.json();

//           setPlayers(
//             data.players
//           );
//         } catch (
//           error
//         ) {
//           console.error(
//             error
//           );

//           setPlayers([]);
//         } finally {
//           setLoadingPlayers(
//             false
//           );
//         }
//       },
//       []
//     );

//   const loadChallenge =
//     useCallback(
//       async () => {
//         try {
//           setLoadingChallenge(
//             true
//           );

//           const response =
//             await fetch(
//               "/api/ipl/random/challenge",
//               {
//                 cache:
//                   "no-store",
//               }
//             );

//           if (
//             !response.ok
//           ) {
//             throw new Error(
//               "Unable to load IPL challenge."
//             );
//           }

//           const data:
//             Challenge =
//             await response.json();

//           setChallenge(
//             data
//           );

//           await loadPlayers(
//             data.teamSeasonId
//           );
//         } catch (
//           error
//         ) {
//           console.error(
//             error
//           );
//         } finally {
//           setLoadingChallenge(
//             false
//           );
//         }
//       },
//       [
//         loadPlayers,
//       ]
//     );

//   useEffect(() => {
//     void loadChallenge();
//   }, [
//     loadChallenge,
//   ]);

//   const spinTeam =
//     async () => {
//       if (
//         spinningTeam ||
//         !challenge
//       ) {
//         return;
//       }

//       try {
//         setSpinningTeam(
//           true
//         );

//         setSelectedPlayers(
//           []
//         );

//         /*
//          * Visual rolling effect.
//          */
//         const interval =
//           window.setInterval(
//             () => {
//               const temporaryNames =
//                 [
//                   "Chennai Super Kings",
//                   "Mumbai Indians",
//                   "Kolkata Knight Riders",
//                   "Rajasthan Royals",
//                   "Sunrisers Hyderabad",
//                   "Royal Challengers Bangalore",
//                   "Delhi Capitals",
//                   "Punjab Kings",
//                 ];

//               const randomName =
//                 temporaryNames[
//                   Math.floor(
//                     Math.random() *
//                       temporaryNames.length
//                   )
//                 ];

//               setRollingTeamName(
//                 randomName
//               );
//             },
//             90
//           );

//         const response =
//           await fetch(
//             "/api/ipl/random/challenge",
//             {
//               cache:
//                 "no-store",
//             }
//           );

//         if (
//           !response.ok
//         ) {
//           throw new Error(
//             "Unable to spin team."
//           );
//         }

//         const data:
//           Challenge =
//           await response.json();

//         await new Promise(
//           (resolve) =>
//             window.setTimeout(
//               resolve,
//               850
//             )
//         );

//         window.clearInterval(
//           interval
//         );

//         setChallenge(
//           data
//         );

//         setRollingTeamName(
//           ""
//         );

//         await loadPlayers(
//           data.teamSeasonId
//         );
//       } catch (
//         error
//       ) {
//         console.error(
//           error
//         );
//       } finally {
//         setSpinningTeam(
//           false
//         );
//       }
//     };

//   const spinSeason =
//     async () => {
//       if (
//         spinningSeason ||
//         !challenge
//       ) {
//         return;
//       }

//       try {
//         setSpinningSeason(
//           true
//         );

//         setSelectedPlayers(
//           []
//         );

//         const interval =
//           window.setInterval(
//             () => {
//               const year =
//                 Math.floor(
//                   2008 +
//                     Math.random() *
//                       19
//                 );

//               setRollingSeason(
//                 String(year)
//               );
//             },
//             90
//           );

//         /*
//          * We spin a new valid
//          * team-season combination.
//          *
//          * Later we can introduce
//          * a dedicated endpoint
//          * that preserves the team
//          * and only changes its
//          * valid season.
//          */
//         const response =
//           await fetch(
//             "/api/ipl/random/challenge",
//             {
//               cache:
//                 "no-store",
//             }
//           );

//         if (
//           !response.ok
//         ) {
//           throw new Error(
//             "Unable to spin season."
//           );
//         }

//         const data:
//           Challenge =
//           await response.json();

//         await new Promise(
//           (resolve) =>
//             window.setTimeout(
//               resolve,
//               850
//             )
//         );

//         window.clearInterval(
//           interval
//         );

//         setChallenge(
//           data
//         );

//         setRollingSeason(
//           ""
//         );

//         await loadPlayers(
//           data.teamSeasonId
//         );
//       } catch (
//         error
//       ) {
//         console.error(
//           error
//         );
//       } finally {
//         setSpinningSeason(
//           false
//         );
//       }
//     };

//   const filteredPlayers =
//     useMemo(
//       () => {
//         return players.filter(
//           (
//             player
//           ) => {
//             const matchesSearch =
//               player.name
//                 .toLowerCase()
//                 .includes(
//                   search.toLowerCase()
//                 );

//             const role =
//               getPlayerRole(
//                 player
//               );

//             const matchesRole =
//               roleFilter ===
//                 "ALL" ||
//               role ===
//                 roleFilter ||
//               (
//                 roleFilter ===
//                   "ALL_ROUNDER" &&
//                 role ===
//                   "ALL"
//               );

//             return (
//               matchesSearch &&
//               matchesRole
//             );
//           }
//         );
//       },
//       [
//         players,
//         search,
//         roleFilter,
//       ]
//     );

//   const addPlayer =
//     (
//       player: Player
//     ) => {
//       if (
//         selectedPlayers.some(
//           (
//             selected
//           ) =>
//             selected.playerId ===
//             player.playerId
//         )
//       ) {
//         return;
//       }

//       if (
//         selectedPlayers.length >=
//         11
//       ) {
//         return;
//       }

//       setSelectedPlayers(
//         (
//           current
//         ) => [
//           ...current,
//           player,
//         ]
//       );
//     };

//   const removePlayer =
//     (
//       playerId: string
//     ) => {
//       setSelectedPlayers(
//         (
//           current
//         ) =>
//           current.filter(
//             (
//               player
//             ) =>
//               player.playerId !==
//               playerId
//           )
//       );
//     };

//   if (
//     loadingChallenge
//   ) {
//     return (
//       <main className="flex min-h-screen items-center justify-center bg-[#101622]">
//         <div className="text-sm font-semibold tracking-[0.2em] text-slate-400">
//           LOADING IPL CHALLENGE...
//         </div>
//       </main>
//     );
//   }

//   if (
//     !challenge
//   ) {
//     return (
//       <main className="flex min-h-screen items-center justify-center bg-[#101622]">
//         <div className="text-center">
//           <p className="text-lg font-bold">
//             Unable to load challenge.
//           </p>
//         </div>
//       </main>
//     );
//   }

//   return (
//     <main className="min-h-screen bg-[#101622] px-6 py-8 text-white">
//       <div className="mx-auto max-w-[1500px]">
//         {/* HEADER */}

//         <div className="mb-8 flex items-center justify-between">
//           <div>
//             <div className="mb-2 flex items-center gap-3">
//               <Trophy className="h-5 w-5 text-orange-400" />

//               <span className="text-xs font-bold tracking-[0.28em] text-slate-400">
//                 IPL CHALLENGE
//               </span>
//             </div>

//             <h1 className="text-3xl font-black">
//               Build Your XI
//             </h1>
//           </div>

//           <div className="rounded-xl border border-slate-700 bg-[#151d2b] px-5 py-3">
//             <span className="text-xs text-slate-400">
//               Selected
//             </span>

//             <div className="text-lg font-black">
//               {selectedPlayers.length}
//               /11
//             </div>
//           </div>
//         </div>

//         {/* MAIN GRID */}

//         <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.9fr)]">

//           {/* LEFT */}

//           <section className="min-w-0">

//             {/* RANDOMIZER */}

//             <div className="mb-6 grid gap-3 sm:grid-cols-2">
//               {/* TEAM */}

//               <div className="rounded-xl border border-slate-700 bg-[#151d2b] p-5">
//                 <div className="mb-5 flex items-center gap-2">
//                   <Users className="h-4 w-4 text-orange-400" />

//                   <span className="text-xs font-bold tracking-[0.22em] text-slate-400">
//                     IPL TEAM
//                   </span>
//                 </div>

//                 <div className="min-h-[76px]">
//                   <div
//                     className={`text-3xl font-black transition-all duration-100 ${
//                       spinningTeam
//                         ? "translate-y-[-3px] blur-[1px]"
//                         : ""
//                     }`}
//                   >
//                     {spinningTeam
//                       ? rollingTeamName
//                       : challenge.team
//                           .name}
//                   </div>
//                 </div>

//                 <button
//                   type="button"
//                   onClick={
//                     spinTeam
//                   }
//                   disabled={
//                     spinningTeam
//                   }
//                   className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
//                 >
//                   <RefreshCw
//                     className={`h-4 w-4 ${
//                       spinningTeam
//                         ? "animate-spin"
//                         : ""
//                     }`}
//                   />

//                   SPIN TEAM
//                 </button>
//               </div>

//               {/* SEASON */}

//               <div className="rounded-xl border border-slate-700 bg-[#151d2b] p-5">
//                 <div className="mb-5 flex items-center gap-2">
//                   <Trophy className="h-4 w-4 text-orange-400" />

//                   <span className="text-xs font-bold tracking-[0.22em] text-slate-400">
//                     IPL SEASON
//                   </span>
//                 </div>

//                 <div className="min-h-[76px]">
//                   <div
//                     className={`text-4xl font-black transition-all duration-100 ${
//                       spinningSeason
//                         ? "translate-y-[-3px] blur-[1px]"
//                         : ""
//                     }`}
//                   >
//                     {spinningSeason
//                       ? rollingSeason
//                       : challenge.season
//                           .season}
//                   </div>
//                 </div>

//                 <button
//                   type="button"
//                   onClick={
//                     spinSeason
//                   }
//                   disabled={
//                     spinningSeason
//                   }
//                   className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
//                 >
//                   <RefreshCw
//                     className={`h-4 w-4 ${
//                       spinningSeason
//                         ? "animate-spin"
//                         : ""
//                     }`}
//                   />

//                   SPIN SEASON
//                 </button>
//               </div>
//             </div>

//             {/* SEARCH + FILTERS */}

//             <div className="mb-4 flex flex-col gap-3 sm:flex-row">
//               <div className="relative flex-1">
//                 <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

//                 <input
//                   value={search}
//                   onChange={(event) =>
//                     setSearch(
//                       event.target.value
//                     )
//                   }
//                   placeholder="Search players..."
//                   className="w-full rounded-lg border border-slate-700 bg-[#151d2b] py-3 pl-11 pr-4 text-sm outline-none placeholder:text-slate-500 focus:border-orange-400"
//                 />
//               </div>

//               <div className="flex gap-2">
//                 {[
//                   "ALL",
//                   "BAT",
//                   "BOWL",
//                   "ALL_ROUNDER",
//                 ].map(
//                   (
//                     role
//                   ) => (
//                     <button
//                       key={
//                         role
//                       }
//                       type="button"
//                       onClick={() =>
//                         setRoleFilter(
//                           role as typeof roleFilter
//                         )
//                       }
//                       className={`rounded-lg px-4 py-3 text-xs font-bold ${
//                         roleFilter ===
//                         role
//                           ? "bg-orange-500 text-white"
//                           : "border border-slate-700 bg-[#151d2b] text-slate-400"
//                       }`}
//                     >
//                       {role ===
//                       "ALL_ROUNDER"
//                         ? "AR"
//                         : role}
//                     </button>
//                   )
//                 )}
//               </div>
//             </div>

//             {/* PLAYER COUNT */}

//             <div className="mb-3 flex items-center justify-between">
//               <span className="text-sm text-slate-400">
//                 Player pool
//               </span>

//               <span className="text-sm font-bold">
//                 {filteredPlayers.length} players available
//               </span>
//             </div>

//             {/* PLAYER LIST */}

//             <div className="max-h-[650px] space-y-2 overflow-y-auto pr-2">
//               {loadingPlayers ? (
//                 <div className="rounded-xl border border-slate-700 bg-[#151d2b] p-8 text-center text-sm text-slate-400">
//                   Loading players...
//                 </div>
//               ) : (
//                 filteredPlayers.map(
//                   (
//                     player
//                   ) => {
//                     const isSelected =
//                       selectedPlayers.some(
//                         (
//                           selected
//                         ) =>
//                           selected.playerId ===
//                           player.playerId
//                       );

//                     return (
//                       <button
//                         key={
//                           player.statisticId
//                         }
//                         type="button"
//                         disabled={
//                           isSelected
//                         }
//                         onClick={() =>
//                           addPlayer(
//                             player
//                           )
//                         }
//                         className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
//                           isSelected
//                             ? "border-orange-500/50 bg-orange-500/10 opacity-60"
//                             : "border-slate-700 bg-[#151d2b] hover:border-orange-400"
//                         }`}
//                       >
//                         <div>
//                           <div className="mb-1 font-bold">
//                             {
//                               player.name
//                             }
//                           </div>

//                           <div className="text-xs text-slate-400">
//                             {
//                               getPlayerRole(
//                                 player
//                               )
//                             }
//                             {" • "}
//                             {
//                               player.matches
//                             }{" "}
//                             matches
//                           </div>
//                         </div>

//                         <div className="flex items-center gap-5 text-right">
//                           <div>
//                             <div className="font-bold">
//                               {
//                                 player.runs
//                               }
//                             </div>

//                             <div className="text-[10px] font-bold text-slate-500">
//                               RUNS
//                             </div>
//                           </div>

//                           <div>
//                             <div className="font-bold">
//                               {
//                                 player.wickets
//                               }
//                             </div>

//                             <div className="text-[10px] font-bold text-slate-500">
//                               WKTS
//                             </div>
//                           </div>

//                           <Plus className="h-5 w-5 text-orange-400" />
//                         </div>
//                       </button>
//                     );
//                   }
//                 )
//               )}
//             </div>
//           </section>

//           {/* RIGHT */}

//           <aside>
//             <div className="sticky top-6 overflow-hidden rounded-2xl border border-slate-700 bg-[#151d2b]">

//               {/* TEAM HEADER */}

//               <div className="border-b border-slate-700 p-5">
//                 <div className="text-xs font-bold tracking-[0.2em] text-slate-400">
//                   YOUR SELECTED XI
//                 </div>

//                 <div className="mt-2 text-xl font-black">
//                   {
//                     challenge.team
//                       .name
//                   }
//                 </div>

//                 <div className="mt-1 text-sm text-orange-400">
//                   {
//                     challenge.season
//                       .season
//                   }
//                 </div>
//               </div>

//               {/* CRICKET FIELD */}

//               <div className="relative min-h-[620px] overflow-hidden bg-[#101a17] p-6">

//                 {/* FIELD DECORATION */}

//                 <div className="absolute inset-6 rounded-[50%] border border-emerald-900/60" />

//                 <div className="absolute left-1/2 top-8 h-[560px] w-[150px] -translate-x-1/2 rounded-[70px] border border-emerald-800/60 bg-emerald-950/20" />

//                 <div className="absolute left-1/2 top-1/2 h-[130px] w-[90px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-orange-400/30 bg-orange-400/5" />

//                 {/* SELECTED PLAYERS */}

//                 <div className="relative z-10 grid grid-cols-2 gap-3 pt-3">
//                   {selectedPlayers.map(
//                     (
//                       player,
//                       index
//                     ) => (
//                       <div
//                         key={
//                           player.playerId
//                         }
//                         className="group rounded-xl border border-orange-400/50 bg-[#18251f] p-3 shadow-lg"
//                       >
//                         <div className="flex items-start justify-between gap-2">
//                           <div>
//                             <div className="text-[10px] font-bold text-orange-400">
//                               PLAYER{" "}
//                               {
//                                 index +
//                                 1
//                               }
//                             </div>

//                             <div className="mt-1 text-sm font-bold">
//                               {
//                                 player.name
//                               }
//                             </div>

//                             <div className="mt-1 text-xs text-slate-400">
//                               {
//                                 getPlayerRole(
//                                   player
//                                 )
//                               }
//                             </div>
//                           </div>

//                           <button
//                             type="button"
//                             onClick={() =>
//                               removePlayer(
//                                 player.playerId
//                               )
//                             }
//                             className="text-slate-500 transition hover:text-red-400"
//                           >
//                             <X className="h-4 w-4" />
//                           </button>
//                         </div>
//                       </div>
//                     )
//                   )}
//                 </div>

//                 {/* EMPTY STATE */}

//                 {selectedPlayers.length ===
//                   0 && (
//                   <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
//                     <Users className="mb-4 h-10 w-10 text-slate-600" />

//                     <div className="font-bold text-slate-400">
//                       Select players
//                     </div>

//                     <p className="mt-2 max-w-[220px] text-sm text-slate-500">
//                       Choose players from
//                       the list to build
//                       your IPL XI.
//                     </p>
//                   </div>
//                 )}
//               </div>

//               {/* BOTTOM */}

//               <div className="border-t border-slate-700 p-5">
//                 <button
//                   type="button"
//                   disabled={
//                     selectedPlayers.length !==
//                     11
//                   }
//                   className="w-full rounded-xl bg-orange-500 py-4 text-sm font-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
//                 >
//                   {selectedPlayers.length ===
//                   11
//                     ? "SUBMIT XI"
//                     : `SELECT ${
//                         11 -
//                         selectedPlayers.length
//                       } MORE PLAYERS`}
//                 </button>
//               </div>
//             </div>
//           </aside>
//         </div>
//       </div>
//     </main>
//   );
// }