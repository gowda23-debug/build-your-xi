import type { IPLChallenge, PitchProfile } from "@/types/ipl";

export type IPLVenue = {
  id: string;
  name: string;
  city: string;
  pitch: PitchProfile["type"];
  summary: string;
  batting: number;
  pace: number;
  spin: number;
  dew: number;
};

const VENUES: Record<string, IPLVenue> = {
  chinnaswamy: { id: "chinnaswamy", name: "M. Chinnaswamy Stadium", city: "Bengaluru", pitch: "BAT", summary: "A high-scoring ground with a quick outfield, short boundaries and strong value for clean striking.", batting: 95, pace: 65, spin: 45, dew: 75 },
  wankhede: { id: "wankhede", name: "Wankhede Stadium", city: "Mumbai", pitch: "PACE", summary: "Good carry early, a fast outfield and evening dew that can make chasing easier.", batting: 88, pace: 82, spin: 48, dew: 82 },
  chepauk: { id: "chepauk", name: "M. A. Chidambaram Stadium", city: "Chennai", pitch: "SPIN", summary: "A slower surface where grip, variation and intelligent strike rotation become important.", batting: 62, pace: 48, spin: 92, dew: 58 },
  eden: { id: "eden", name: "Eden Gardens", city: "Kolkata", pitch: "PACE", summary: "A generally true surface with good pace through the bat and significant evening dew potential.", batting: 86, pace: 78, spin: 58, dew: 80 },
  arun_jaitley: { id: "arun-jaitley", name: "Arun Jaitley Stadium", city: "Delhi", pitch: "BALANCED", summary: "A compact venue where stroke-making can be rewarded but slower bowling and variation remain useful.", batting: 78, pace: 65, spin: 72, dew: 62 },
  rajiv_gandhi: { id: "rajiv-gandhi", name: "Rajiv Gandhi International Cricket Stadium", city: "Hyderabad", pitch: "BALANCED", summary: "A generally balanced surface that can offer strong batting value while rewarding disciplined bowling.", batting: 80, pace: 68, spin: 65, dew: 68 },
  ekana: { id: "ekana", name: "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium", city: "Lucknow", pitch: "SPIN", summary: "A surface that can be slower and lower, bringing cutters and spin into the game.", batting: 62, pace: 55, spin: 84, dew: 45 },
  narendra_modi: { id: "narendra-modi", name: "Narendra Modi Stadium", city: "Ahmedabad", pitch: "BALANCED", summary: "A large venue with conditions that can vary by surface, offering a broad tactical mix.", batting: 76, pace: 70, spin: 68, dew: 55 },
  sawai_mansingh: { id: "sawai-mansingh", name: "Sawai Mansingh Stadium", city: "Jaipur", pitch: "BALANCED", summary: "A traditionally slower venue where smart batting and changes of pace can be valuable.", batting: 70, pace: 58, spin: 78, dew: 52 },
  mohali: { id: "mohali", name: "PCA IS Bindra Stadium", city: "Mohali", pitch: "PACE", summary: "A surface historically associated with good carry and pace, especially for seamers who hit the deck.", batting: 76, pace: 84, spin: 52, dew: 60 },
  new_chandigarh: { id: "new-chandigarh", name: "New International Cricket Stadium", city: "New Chandigarh", pitch: "PACE", summary: "A modern northern venue with useful carry and enough batting value for aggressive stroke play.", batting: 78, pace: 80, spin: 55, dew: 62 },
  guwahati: { id: "guwahati", name: "Barsapara Cricket Stadium", city: "Guwahati", pitch: "BALANCED", summary: "A balanced modern venue with good batting value and enough pace for seamers to stay involved.", batting: 78, pace: 72, spin: 58, dew: 70 },
  dharamsala: { id: "dharamsala", name: "Himachal Pradesh Cricket Association Stadium", city: "Dharamsala", pitch: "PACE", summary: "A high-altitude venue where seam and swing can be particularly relevant alongside clean batting.", batting: 72, pace: 88, spin: 52, dew: 48 },
  indore: { id: "indore", name: "Holkar Cricket Stadium", city: "Indore", pitch: "BAT", summary: "A compact, high-scoring venue where batters can make the most of a fast outfield.", batting: 90, pace: 62, spin: 48, dew: 68 },
  pune: { id: "pune", name: "Maharashtra Cricket Association Stadium", city: "Pune", pitch: "BALANCED", summary: "A generally even venue offering a blend of carry, stroke-making and useful pace-off bowling.", batting: 78, pace: 72, spin: 58, dew: 58 },
  rajkot: { id: "rajkot", name: "Niranjan Shah Stadium", city: "Rajkot", pitch: "BAT", summary: "A batting-friendly venue where the ball can come on nicely and totals can rise quickly.", batting: 88, pace: 64, spin: 50, dew: 68 },
  kochi: { id: "kochi", name: "Jawaharlal Nehru Stadium", city: "Kochi", pitch: "BALANCED", summary: "A coastal venue where humidity and conditions can keep both batting and bowling in play.", batting: 72, pace: 70, spin: 58, dew: 72 },
};

const TEAM_VENUES: Record<string, string> = {
  "chennai super kings": "chepauk",
  "mumbai indians": "wankhede",
  "kolkata knight riders": "eden",
  "royal challengers bengaluru": "chinnaswamy",
  "royal challengers bangalore": "chinnaswamy",
  "delhi capitals": "arun_jaitley",
  "delhi daredevils": "arun_jaitley",
  "sunrisers hyderabad": "rajiv_gandhi",
  "deccan chargers": "rajiv_gandhi",
  "lucknow super giants": "ekana",
  "gujarat titans": "narendra_modi",
  "rajasthan royals": "sawai_mansingh",
  "punjab kings": "mohali",
  "kings xi punjab": "mohali",
  "gujarat lions": "rajkot",
  "pune warriors india": "pune",
  "rising pune supergiant": "pune",
  "rising pune supergiants": "pune",
  "kochi tuskers kerala": "kochi",
};

export function getVenueForChallenge(challenge: IPLChallenge): IPLVenue {
  const teamName = challenge.team.name.trim().toLowerCase();
  const key = TEAM_VENUES[teamName] ?? "narendra_modi";

  if ((teamName === "punjab kings" || teamName === "kings xi punjab") && challenge.season.startYear >= 2025) {
    return VENUES.new_chandigarh;
  }

  // Rajasthan used Ahmedabad as its designated home venue in 2014.
  if (teamName === "rajasthan royals" && challenge.season.startYear === 2014) {
    return VENUES.narendra_modi;
  }

  return VENUES[key];
}

export function getPitchForVenue(venue: IPLVenue): PitchProfile {
  const titles: Record<PitchProfile["type"], string> = {
    BAT: "Batting Paradise",
    PACE: "Pace & Bounce",
    SPIN: "Slow Turner",
    BALANCED: "Balanced Surface",
  };

  const strategies: Record<PitchProfile["type"], string> = {
    BAT: "Prioritise aggressive top-order batting and players who can score quickly without losing wickets.",
    PACE: "Value batters who handle pace and bowlers who can exploit carry, bounce or seam.",
    SPIN: "Prioritise quality spin options and batters capable of rotating the strike against slower bowling.",
    BALANCED: "Build a flexible XI that can adapt to both batting and bowling conditions.",
  };

  return {
    id: `${venue.id}-${venue.pitch.toLowerCase()}`,
    title: titles[venue.pitch],
    type: venue.pitch,
    summary: venue.summary,
    batting: venue.batting,
    pace: venue.pace,
    spin: venue.spin,
    dew: venue.dew,
    strategy: strategies[venue.pitch],
  };
}
