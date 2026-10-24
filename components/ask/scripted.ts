/** Scripted attendant: keyword matching over the station notes, used when no API key is configured. No three.js here. */
import { EVENT_META, type EventId, type Season, SEASONS, type Weather } from "@/components/train/lookTypes";
import type { MonumentKey } from "@/components/train/monumentData";

export type SceneChange = { weather?: Weather; season?: Season; time?: "day" | "night"; event?: EventId | null };
export type ScriptedReply = { answer: string | null; go: number | null; scene: SceneChange | null; monument?: MonumentKey };

/** Event phrases, matched before anything else ("fireworks" must not read as "work", "rainbow" as "rain"). */
const EVENT_WORDS: [EventId, string[]][] = [
  ["cherry", ["cherry", "blossom", "sakura"]],
  ["light", ["fireworks", "celebration of light"]],
  ["pride", ["pride", "rainbow"]],
  ["diwali", ["diwali", "diya"]],
  ["halloween", ["halloween", "pumpkin", "spooky"]],
  ["brightnights", ["bright nights", "christmas", "holiday lights", "festive"]],
  ["lunar", ["lunar new year", "chinese new year", "lunar", "lantern"]],
  ["vaisakhi", ["vaisakhi", "baisakhi"]],
];

const MONUMENT_WORDS: [MonumentKey, string[]][] = [
  ["reconciliation", ["reconciliation", "every child matters", "veterans monument", "indigenous monument"]],
  ["scienceWorld", ["science world", "sphere", "geodesic", "dome"]],
  ["bcPlace", ["bc place"]],
  ["canadaPlace", ["canada place", "sails"]],
  ["harbourCentre", ["harbour centre", "harbor center", "lookout tower"]],
  ["steamClock", ["steam clock", "gastown"]],
  ["gate", ["millennium gate", "chinatown gate"]],
  ["orca", ["digital orca", "orca", "coupland"]],
  ["cauldron", ["cauldron", "olympic"]],
  ["rogers", ["rogers arena", "canucks"]],
];

/** Returns the answer, the station index to drive to and any scene change the visitor asked for. */
export function scripted(q: string): ScriptedReply {
  const t = q.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  for (const [id, words] of EVENT_WORDS) {
    if (!has(...words)) continue;
    const m = EVENT_META[id];
    return {
      answer: `Lighting the city for ${m.label}: ${m.note}.${m.night ? " I switched to night so the monuments glow." : ""} Click Science World or BC Place to circle them.`,
      go: null,
      scene: { event: id, season: m.season, weather: m.weather, time: m.night ? "night" : undefined },
    };
  }
  if (has("no event", "turn off the event", "plain city")) return { answer: "The city is back to its everyday lights.", go: null, scene: { event: null } };
  for (const [key, words] of MONUMENT_WORDS) {
    if (has(...words) && has("show", "see", "look", "circle", "where", "visit", "take me")) {
      return { answer: "Here it is. Drag to circle it, ctrl and scroll to zoom, Esc to come back to the train.", go: null, scene: null, monument: key };
    }
  }
  const scene: SceneChange = {};
  if (has("rain")) scene.weather = "rain";
  else if (has("snow")) scene.weather = "snow";
  else if (has("sunny", "clear sky", "sunshine")) scene.weather = "clear";
  else if (has("cloud", "overcast", "grey")) scene.weather = "overcast";
  for (const se of SEASONS) if (has(se, se === "fall" ? "autumn" : se)) scene.season = se;
  if (has("night", "dark mode", "evening")) scene.time = "night";
  else if (has("daytime", "day mode", "morning", "light mode")) scene.time = "day";
  if (Object.keys(scene).length) return { answer: null, go: null, scene };

  const reply = (answer: string, go: number | null): ScriptedReply => ({ answer, go, scene: null });
  if (has("cursor", "awdon", "transcript", "jira"))
    return reply(
      "Awdon came out of the Cursor Hackathon Vancouver 2026 and won Best Use of CLōD. It turns meeting transcripts into sprint tasks and team documents, and a PM approves everything before it is sent. Taking you to Awdon.",
      3,
    );
  if (has("dinov2", "plankton", "algae", "ocean"))
    return reply(
      "Planktoneer uses frozen DINOv2 features with gradient-boosted heads to count four harmful algae in flow-cytometer data, with held-out AP up to 0.99. Built in four days at OceanHackWeek 2026. Taking you to Planktoneer.",
      4,
    );
  if (has("pytorch", "torch", "ml ", "machine learning", "model"))
    return reply("Three stops use PyTorch: Planktoneer, Vessel Vision and the AI Weed Detector. Starting with Planktoneer.", 4);
  if (has("vessel", "boat", "yolo", "sahi"))
    return reply(
      "Vessel Vision detects vessels in high-resolution coastal imagery with YOLO and SAHI slicing, and it runs as a public Hugging Face Space. Taking you to Vessel Vision.",
      5,
    );
  if (has("weed", "blueberry", "detr", "farm"))
    return reply(
      "The AI Weed Detector is an industry-sponsored BCIT project: a custom blueberry-field dataset and an RF-DETR pipeline at 0.64 mAP@50 and 0.68 F1. Taking you to the AI Weed Detector.",
      6,
    );
  if (has("abckidz", "backend", "prisma", "azure", "production"))
    return reply(
      "ABCKidz is a production REST backend with role-based access control, Prisma and Postgres, an Azure GPT-4o chatbot and streamed uploads up to 100 MB. Taking you to ABCKidz.",
      7,
    );
  if (has("contact", "email", "reach", "hire", "linkedin", "resume"))
    return reply("Email is fastest: linhoang.ce@gmail.com, replies within a day. GitHub, LinkedIn and the one-page resume are at the last stop, Contact.", 9);
  if (has("experience", "work", "job", "qa", "incognito", "founder", "manager"))
    return reply(
      "Linh co-founded Awdon in 2026, an AI-native workspace for software agencies, after working as a Software QA Engineer at Incognito Software Systems (owned Jenkins and the CI/CD pipeline, built Java test frameworks on Playwright and JUnit, ran RHEL/CentOS test environments). Taking you to Experience.",
      2,
    );
  if (has("skill", "stack", "about", "who", "background", "bcit"))
    return reply(
      "Linh is a co-founder of Awdon and a 2026 BCIT Computer Systems Technology graduate who likes systems with deterministic cores, LLMs at the edges and a human approving what goes out. Favourite tools: Python, TypeScript, scikit-learn, PyTorch and Claude Code. Taking you to About.",
      1,
    );
  return reply("That is not something this line covers. For anything beyond the projects, skills and experience shown here, email linhoang.ce@gmail.com.", null);
}

export const SUGGESTIONS = [
  "What did Linh build at the Cursor hackathon?",
  "Take me to the project that uses DINOv2",
  "Light the city for Pride",
  "Show me Science World",
  "How do I contact Linh?",
];
