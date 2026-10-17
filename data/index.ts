/**
 * Single source of truth for portfolio content and the game's level data.
 * Content is rendered by the in-world screens and by /flat; edit copy here.
 */

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

export type SectionId =
  | "about"
  | "awdon"
  | "planktoneer"
  | "vessel-vision"
  | "weed-detector"
  | "abckidz"
  | "more-projects"
  | "experience"
  | "contact";

export type ProjectLink = { label: string; href: string };

export type Project = {
  id: SectionId;
  title: string;
  context: string;
  copy: string;
  tags: string[];
  links: ProjectLink[];
  /** Path under /public, optional until M2 adds the screenshot set. */
  image?: string;
};

export type MiniProject = { title: string; copy: string; href?: string };

export type Role = { period: string; title: string; detail: string };

export type SkillGroup = { name: string; items: string[] };

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const person = {
  name: "Linh Hoang",
  tagline: "Software developer · ML systems · BCIT Computer Systems Technology 2026",
  url: "https://linh-hoang.vercel.app",
};

export const about = {
  bio: "BCIT Computer Systems Technology graduate (2026) with ten years of leadership and client-service experience before software. I like systems that are honest about their limits: deterministic cores, LLMs at the edges, and a human approving anything that goes out.",
  now: "Now: Kaggle Gemma 4 Developer Agent competition · Software QA Engineer intern",
  skillGroups: [
    { name: "ML / AI", items: ["Python", "PyTorch", "scikit-learn", "DINOv2", "YOLO", "OpenAI & Claude APIs"] },
    { name: "Backend", items: ["FastAPI", "Node.js", "PostgreSQL", "Prisma", "SQLite", "Azure"] },
    { name: "Frontend", items: ["TypeScript", "React", "Next.js", "Tailwind", "Three.js"] },
    { name: "Tooling", items: ["Claude Code", "Playwright", "Docker", "Git", "GCP"] },
  ] satisfies SkillGroup[],
};

export const featured: Project[] = [
  {
    id: "awdon",
    title: "Awdon",
    context: "Cursor Hackathon Vancouver 2026 · Best Use of CLōD · early access",
    copy: "Turns meeting transcripts into sprint tasks and team documents. A PM approves before anything is sent. Imports Zoom/Teams/Meet transcripts, fills the team's own .docx or Google Doc templates, proposes Jira board changes with undo and a decision log.",
    tags: ["FastAPI", "React", "TypeScript", "SQLite", "LLM agents", "Jira", "Google Docs"],
    links: [
      { label: "Live", href: "https://awdon.app" },
      { label: "Devpost", href: "https://devpost.com/software/sidekik-aq0ybu" },
    ],
  },
  {
    id: "planktoneer",
    title: "Planktoneer",
    context: "OceanHackWeek 2026 · four-day build",
    copy: "Turns imaging flow-cytometer data from Bamfield, BC into cells-per-litre for four harmful algae, compared against action levels. Frozen DINOv2 features + gradient-boosted heads; held-out AP 0.99 / 0.95 / 0.84 / 0.63; a domain gate refuses foreign water.",
    tags: ["PyTorch", "DINOv2", "scikit-learn", "XGBoost", "Streamlit"],
    links: [{ label: "GitHub", href: "https://github.com/oceanhackweek/ohw26_proj_planktoneer" }],
  },
  {
    id: "vessel-vision",
    title: "Vessel Vision",
    context: "Ocean Hackathon Victoria 2025",
    copy: "YOLO + SAHI multi-scale vessel detection in high-resolution imagery, deployed as a Hugging Face Space.",
    tags: ["YOLO", "SAHI", "PyTorch", "Hugging Face"],
    links: [{ label: "Hugging Face Space", href: "https://huggingface.co/spaces/linhoang/yolo_boat_detector" }],
    image: "/vessel.png",
  },
  {
    id: "weed-detector",
    title: "AI Weed Detector",
    context: "Industry-sponsored · BCIT",
    copy: "Collected and labelled a custom blueberry-field dataset, then built and evaluated an RF-DETR detection pipeline. 0.64 mAP@50, 0.68 F1.",
    tags: ["RF-DETR", "Roboflow", "Weights & Biases", "Colab"],
    links: [
      {
        label: "Colab",
        href: "https://colab.research.google.com/drive/17qp86__5waQNhgb6oadyiIXPdealv-4C#scrollTo=1c04f3b7&uniqifier=8",
      },
    ],
    image: "/weed.png",
  },
  {
    id: "abckidz",
    title: "ABCKidz",
    context: "Production · abckidz.org",
    copy: "REST API backend for a children's learning platform: role-based access control, Prisma/Postgres models, Azure GPT-4o chatbot with prompt caching, streamed Azure Blob uploads up to 100 MB.",
    tags: ["TypeScript", "PostgreSQL", "Prisma", "Azure"],
    links: [{ label: "Live", href: "https://www.abckidz.org/" }],
    image: "/abckidz.png",
  },
];

export const moreProjects: MiniProject[] = [
  {
    title: "Mini OpenClaw",
    copy: "AI assistant gateway with Telegram, memory, shell/cron tools",
    href: "https://github.com/linhoangce/mini_openclaw",
  },
  {
    title: "LEXMind",
    copy: "Voice legal assistant on OpenAI Realtime with an Obsidian vault",
    href: "https://github.com/linhoangce/law-hacks",
  },
  {
    title: "Unidentified",
    copy: "Private identity handoff for agent transactions",
    href: "https://github.com/linhoangce/Unidentified",
  },
  {
    title: "An",
    copy: "Hospital voice interpreter on Alebex Voice + Twilio",
    href: "https://github.com/linhoangce/alebex-hack",
  },
  {
    title: "Otto Judge",
    copy: "Pixel-art judge reacting live to hackathon scores; Codechella Victoria 2026, team project",
    href: "https://github.com/nhepner1/judgejudgejudge",
  },
  { title: "JobBee", copy: "Job-search agent; local only, no link" },
];

export const roles: Role[] = [
  {
    period: "2025 – now",
    title: "Software QA Engineer Intern",
    detail: "Playwright, Java, Jenkins; Kafka/MQTT/TR-069 on multi-VM Linux",
  },
  { period: "2021 – 2023", title: "Medical Interpreter L4", detail: "English–Vietnamese" },
  { period: "2019 – 2020", title: "Project Manager", detail: "New cafe concept, 166 % sales increase" },
  {
    period: "2018 – 2019",
    title: "Training & Development Specialist",
    detail: "Lean programs, 198 % sales boost",
  },
  { period: "2014 – 2016", title: "Operation Supervisor", detail: "" },
];

export const contact = {
  heading: "Let's talk.",
  email: "linhoang.ce@gmail.com",
  github: "https://github.com/linhoangce",
  linkedin: "https://www.linkedin.com/in/lhoang-bcit/",
  resume: "/resume.pdf",
};

// ---------------------------------------------------------------------------
// Game data types
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];

export type MissionId =
  | "first-waddle"
  | "fishing-lesson"
  | "cross-channel"
  | "watch-water"
  | "sort-catch"
  | "chick-school"
  | "send-message";

export type Objective =
  | { type: "reach"; zone: string }
  | { type: "collect"; tag: string; count: number; zone?: string }
  | { type: "collectTagged"; tag: string; count: number; penaltyTag: string }
  | { type: "aim"; targets: number }
  | { type: "herd"; tag: string; zone: string; count: number }
  | { type: "carry"; item: string; zone: string };

export type Mission = {
  id: MissionId;
  title: string;
  /** One line shown in the HUD while active. */
  objectiveText: string;
  objective: Objective;
  startZone: string;
  section: SectionId;
  /** Par time in seconds for the time bonus. */
  par: number;
  points: number;
  hints: string[];
};

export type ZoneDef = {
  id: string;
  /** Centre of the sensor box. */
  position: Vec3;
  /** Full extents of the sensor box. */
  size: Vec3;
};

export type ScreenDef = {
  id: SectionId;
  /** Where the panel is mounted (centre of the panel). */
  position: Vec3;
  /** Rotation about Y. 0 faces south (+z), PI faces north (-z), PI/2 faces east (+x). */
  yaw: number;
  /** Panel size in metres [width, height]. */
  size: [number, number];
  /** Zone the visitor must stand in to interact. */
  zone: string;
  /** What the panel is mounted on, for the HUD prompt. */
  mount: string;
};

export type SectionDef = {
  id: SectionId;
  title: string;
  kind: "about" | "project" | "shelf" | "experience" | "contact";
  /** Mission that unlocks the section; undefined means always readable. */
  unlockedBy?: MissionId;
  /** Where the section lives in the world, for the menu. */
  place: string;
};

// ---------------------------------------------------------------------------
// Game data
// ---------------------------------------------------------------------------

export const world = {
  waterLevel: 0,
  /** Height of the walkable ice above the water. */
  iceTop: 0.6,
  seabed: -4,
  /** Half extents of the play area; invisible walls sit here. */
  bounds: { x: 60, z: 45 },
  killY: -25,
  spawn: { position: [-40, 1.2, 30] as Vec3, yaw: Math.PI },
};

export const sections: SectionDef[] = [
  { id: "about", title: "About", kind: "about", unlockedBy: "first-waddle", place: "Colony board by the cottage" },
  { id: "planktoneer", title: "Planktoneer", kind: "project", unlockedBy: "fishing-lesson", place: "Buoy in the kelp bay" },
  { id: "awdon", title: "Awdon", kind: "project", unlockedBy: "cross-channel", place: "Planning board on the dock" },
  { id: "vessel-vision", title: "Vessel Vision", kind: "project", unlockedBy: "watch-water", place: "Telescope on the lookout" },
  { id: "weed-detector", title: "AI Weed Detector", kind: "project", unlockedBy: "sort-catch", place: "Lab hut sorting table" },
  { id: "abckidz", title: "ABCKidz", kind: "project", unlockedBy: "chick-school", place: "School rock signboard" },
  { id: "more-projects", title: "More projects", kind: "shelf", place: "Lab hut shelf" },
  { id: "experience", title: "Experience", kind: "experience", place: "Lab hut timeline wall" },
  { id: "contact", title: "Contact", kind: "contact", unlockedBy: "send-message", place: "Radio shack" },
];

export const zones: ZoneDef[] = [
  { id: "spawn-pad", position: [-40, 1.5, 30], size: [10, 5, 10] },
  { id: "colony-board", position: [-32, 1.5, -5], size: [9, 5, 8] },
  { id: "bay-shore", position: [8, 0.5, -16], size: [12, 7, 14] },
  { id: "dock-board", position: [46, 1.5, 24.5], size: [10, 5, 7] },
  { id: "lookout", position: [-8, 1.5, -11], size: [10, 5, 8] },
  { id: "lab-east", position: [-27.5, 1.5, 12], size: [7, 5, 9] },
  { id: "lab-south", position: [-38, 1.5, 18.5], size: [11, 5, 7] },
  { id: "lab-north", position: [-36, 1.5, 5.5], size: [11, 5, 7] },
  { id: "school-rock", position: [-45, 1.5, -15.5], size: [11, 5, 7] },
  { id: "radio", position: [-12, 1.5, 29.5], size: [9, 5, 7] },
];

export const screens: ScreenDef[] = [
  { id: "about", position: [-32, 1.9, -8], yaw: 0, size: [3.4, 2.1], zone: "colony-board", mount: "Colony board" },
  { id: "planktoneer", position: [10.5, 1.6, -16], yaw: -Math.PI / 2, size: [3.2, 2.0], zone: "bay-shore", mount: "Holographic buoy" },
  { id: "awdon", position: [46, 1.9, 21.5], yaw: Math.PI, size: [3.4, 2.1], zone: "dock-board", mount: "Planning board" },
  { id: "vessel-vision", position: [-8, 1.9, -14.5], yaw: 0, size: [3.2, 2.0], zone: "lookout", mount: "Telescope display" },
  { id: "weed-detector", position: [-30.85, 1.9, 12], yaw: Math.PI / 2, size: [3.2, 2.0], zone: "lab-east", mount: "Sorting table screen" },
  { id: "more-projects", position: [-38, 1.9, 15.15], yaw: 0, size: [3.6, 2.2], zone: "lab-south", mount: "Project shelf" },
  { id: "experience", position: [-36, 1.9, 8.85], yaw: Math.PI, size: [3.6, 2.2], zone: "lab-north", mount: "Timeline wall" },
  { id: "abckidz", position: [-45, 1.9, -19], yaw: 0, size: [3.2, 2.0], zone: "school-rock", mount: "School rock signboard" },
  { id: "contact", position: [-12, 1.9, 26.15], yaw: 0, size: [3.2, 2.0], zone: "radio", mount: "Radio shack screen" },
];

export const missions: Mission[] = [
  {
    id: "first-waddle",
    title: "First waddle",
    objectiveText: "Walk and slide from the spawn to the colony board by the cottage",
    objective: { type: "reach", zone: "colony-board" },
    startZone: "spawn-pad",
    section: "about",
    par: 40,
    points: 100,
    hints: ["Hold Shift on ice to belly-slide", "The colony board is north, past the lab hut and the cottage"],
  },
  {
    id: "fishing-lesson",
    title: "Fishing lesson",
    objectiveText: "Catch 5 fish in the kelp bay",
    objective: { type: "collect", tag: "fish", count: 5 },
    startZone: "bay-shore",
    section: "planktoneer",
    par: 60,
    points: 100,
    hints: ["Swim with WASD; Space dives and surfaces", "Glide into a school, the fish scatter when you rush"],
  },
  {
    id: "cross-channel",
    title: "Cross the channel",
    objectiveText: "Swim across the channel past the seal to the dock; floes are safe islands",
    objective: { type: "reach", zone: "dock-board" },
    startZone: "bay-shore",
    section: "awdon",
    par: 60,
    points: 100,
    hints: ["Dive when the seal closes in", "Ride a drifting floe to catch your breath"],
  },
  {
    id: "watch-water",
    title: "Watch the water",
    objectiveText: "From the lookout rock, aim the telescope and spot 3 vessel lights",
    objective: { type: "aim", targets: 3 },
    startZone: "lookout",
    section: "vessel-vision",
    par: 45,
    points: 100,
    hints: ["The lights drift along the northern horizon"],
  },
  {
    id: "sort-catch",
    title: "Sort the catch",
    objectiveText: "Collect 3 marked fish and avoid the wrong ones",
    objective: { type: "collectTagged", tag: "marked-fish", count: 3, penaltyTag: "wrong-fish" },
    startZone: "lab-east",
    section: "weed-detector",
    par: 60,
    points: 100,
    hints: ["Marked fish glow cyan; the wrong ones glow red"],
  },
  {
    id: "chick-school",
    title: "Chick school",
    objectiveText: "Herd 3 chicks to the school rock",
    objective: { type: "herd", tag: "chick", zone: "school-rock", count: 3 },
    startZone: "school-rock",
    section: "abckidz",
    par: 60,
    points: 100,
    hints: ["Chicks follow you when you are close"],
  },
  {
    id: "send-message",
    title: "Send the message",
    objectiveText: "Carry the bottle from the spawn to the radio shack",
    objective: { type: "carry", item: "bottle", zone: "radio" },
    startZone: "spawn-pad",
    section: "contact",
    par: 40,
    points: 100,
    hints: ["The bottle drops if the seal catches you"],
  },
];

export const scoring = {
  perFish: 5,
  perMission: 100,
  timeBonusMax: 50,
  sealPenalty: 10,
  wrongFishPenalty: 5,
};

/** Fish schools in the kelp bay: centre, loop radius and count. */
export const fishSchools: { position: Vec3; radius: number; count: number }[] = [
  { position: [20, -1.2, -14], radius: 4, count: 10 },
  { position: [33, -1.6, -21], radius: 5, count: 12 },
  { position: [26, -1.0, -8], radius: 3.5, count: 8 },
];

export const sectionById = Object.fromEntries(sections.map((s) => [s.id, s])) as Record<SectionId, SectionDef>;
export const missionById = Object.fromEntries(missions.map((m) => [m.id, m])) as Record<MissionId, Mission>;
export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, ZoneDef>;
export const screenById = Object.fromEntries(screens.map((s) => [s.id, s])) as Record<SectionId, ScreenDef>;
export const projectById = Object.fromEntries(featured.map((p) => [p.id, p])) as Record<string, Project>;
