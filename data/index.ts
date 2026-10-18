/**
 * Single source of truth for portfolio content and the line's stations.
 * Rendered by the station panels on / and by /text; edit copy here.
 * This module must stay free of three.js so /text never pulls it in.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectId = "awdon" | "planktoneer" | "vessel-vision" | "weed-detector" | "abckidz";

/** Which panel a station opens. */
export type SectionId = "depart" | "about" | "experience" | ProjectId | "more-projects" | "contact";

export type StationId =
  | "waterfront"
  | "burrard"
  | "granville"
  | "stadium"
  | "mainstreet"
  | "commercial"
  | "nanaimo"
  | "29th"
  | "joyce"
  | "patterson";

export type ProjectLink = { label: string; href: string };

export type Metric = { value: string; label: string };

export type Shot = { src: string; width: number; height: number; caption: string };

export type Project = {
  id: ProjectId;
  title: string;
  /** Kicker line without the station code; the panel prepends it. */
  context: string;
  lead: string;
  problem: string;
  approach: string;
  result: string;
  /** Real figures only. */
  metrics: Metric[];
  tags: string[];
  links: ProjectLink[];
  /** Screenshot under /public; M2 adds the full set. */
  shot?: Shot;
};

export type MiniProject = { title: string; copy: string; href?: string };

export type Role = { period: string; title: string; detail: string };

export type SkillGroup = { name: string; items: string[] };

export type Station = {
  id: StationId;
  /** Two-digit code shown on chips and signs. */
  code: string;
  /** Real station name: only on the 3D fascia sign and in the attendant's notes. */
  name: string;
  /** Section name: what the UI shows. */
  section: string;
  /** km east, km south of Waterfront (OpenStreetMap). */
  km: [number, number];
  panel: SectionId;
  /** What the attendant knows about this stop. */
  corpus: string;
};

// ---------------------------------------------------------------------------
// People and sections
// ---------------------------------------------------------------------------

export const person = {
  name: "Linh Hoang",
  tagline: "Software developer · ML systems · BCIT Computer Systems Technology 2026",
  url: "https://linh-hoang.vercel.app",
};

export const intro = {
  kicker: "Portfolio · Expo Line · Vancouver, BC",
  lead: "Software developer building ML systems and LLM agents that are honest about their limits. The work sits at ten stops along the Expo Line, Waterfront to Patterson. Ride the line, or ask the attendant to take you.",
  keys: [
    ["W / scroll", "drive forward, the train settles at the next station"],
    ["1 – 0", "jump to a stop"],
    ["E", "open the station's section"],
    ["Ask", "the attendant answers from this page and can drive you to the right stop"],
  ] as [string, string][],
};

export const depart = {
  title: "Linh Hoang",
  lead: "Software developer building ML systems and LLM agents that are honest about their limits: deterministic cores, models at the edges, and a human approving what goes out.",
  meta: ["BCIT Computer Systems Technology · 2026", "Now: Software QA Engineer intern · Kaggle Gemma 4 agent competition"],
  body: "Ten stops on this line: who I am, where I have worked, five projects with the numbers behind them, more I have built, and how to reach me.",
};

export const about = {
  title: "Ten years leading teams, then software.",
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
    context: "Cursor Hackathon Vancouver 2026 · Best Use of CLōD",
    lead: "Turns meeting transcripts into sprint tasks and team documents. A PM approves before anything is sent.",
    problem: "Decisions made in meetings rarely reach the sprint board intact.",
    approach:
      "Imports Zoom, Teams and Meet transcripts, fills the team's own .docx or Google Doc templates, and proposes Jira board changes with undo and a decision log.",
    result: "Best Use of CLōD. In early access with real teams.",
    metrics: [
      { value: "Best Use of CLōD", label: "Award" },
      { value: "Early access", label: "Status" },
      { value: "3 sources", label: "Zoom · Teams · Meet" },
    ],
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
    lead: "Turns imaging flow-cytometer data from Bamfield, BC into cells per litre for four harmful algae, compared against action levels.",
    problem: "Raw cytometer images are not a number a shellfish grower can act on.",
    approach: "Frozen DINOv2 features with gradient-boosted heads per species. A domain gate refuses water the model has never seen.",
    result: "Held-out AP of 0.99, 0.95, 0.84 and 0.63 across the four species.",
    metrics: [
      { value: "0.99", label: "AP, best class" },
      { value: "4", label: "Harmful algae" },
      { value: "4 days", label: "Build" },
    ],
    tags: ["PyTorch", "DINOv2", "scikit-learn", "XGBoost", "Streamlit"],
    links: [{ label: "GitHub", href: "https://github.com/oceanhackweek/ohw26_proj_planktoneer" }],
  },
  {
    id: "vessel-vision",
    title: "Vessel Vision",
    context: "Ocean Hackathon Victoria 2025",
    lead: "Multi-scale vessel detection in high-resolution coastal imagery, deployed as a public Hugging Face Space.",
    problem: "Vessels are tiny targets inside very large frames, so a single pass misses them.",
    approach: "YOLO with SAHI slicing: detect on overlapping tiles, then merge.",
    result: "A detector anyone can try in the browser.",
    metrics: [
      { value: "YOLO + SAHI", label: "Detector" },
      { value: "HF Space", label: "Deployed" },
      { value: "2025", label: "Victoria" },
    ],
    tags: ["YOLO", "SAHI", "PyTorch", "Hugging Face"],
    links: [{ label: "Hugging Face Space", href: "https://huggingface.co/spaces/linhoang/yolo_boat_detector" }],
    shot: { src: "/vessel.png", width: 1868, height: 868, caption: "huggingface.co/spaces/linhoang" },
  },
  {
    id: "weed-detector",
    title: "AI Weed Detector",
    context: "Industry-sponsored · BCIT",
    lead: "A custom blueberry-field dataset and an RF-DETR detection pipeline for a farming sponsor.",
    problem: "No labelled data existed for weeds in the sponsor's fields.",
    approach:
      "Collected and labelled the dataset in Roboflow, then trained and evaluated RF-DETR with runs tracked in Weights & Biases.",
    result: "0.64 mAP@50 and 0.68 F1 on held-out images.",
    metrics: [
      { value: "0.64", label: "mAP@50" },
      { value: "0.68", label: "F1" },
      { value: "Custom", label: "Dataset" },
    ],
    tags: ["RF-DETR", "Roboflow", "Weights & Biases", "Colab"],
    links: [
      {
        label: "Colab notebook",
        href: "https://colab.research.google.com/drive/17qp86__5waQNhgb6oadyiIXPdealv-4C#scrollTo=1c04f3b7&uniqifier=8",
      },
    ],
    shot: { src: "/weed.png", width: 784, height: 2855, caption: "RF-DETR · blueberry field" },
  },
  {
    id: "abckidz",
    title: "ABCKidz",
    context: "Production · abckidz.org",
    lead: "REST API backend for a children's learning platform.",
    problem: "Teachers, parents and children need different permissions, plus large media uploads.",
    approach:
      "Role-based access control, Prisma and Postgres models, an Azure GPT-4o chatbot with prompt caching, and streamed Azure Blob uploads.",
    result: "In production, with uploads up to 100 MB.",
    metrics: [
      { value: "100 MB", label: "Streamed uploads" },
      { value: "RBAC", label: "Access control" },
      { value: "Live", label: "abckidz.org" },
    ],
    tags: ["TypeScript", "PostgreSQL", "Prisma", "Azure"],
    links: [{ label: "Live", href: "https://www.abckidz.org/" }],
    shot: { src: "/abckidz.png", width: 1891, height: 919, caption: "abckidz.org" },
  },
];

export const moreProjects: MiniProject[] = [
  {
    title: "Mini OpenClaw",
    copy: "AI assistant gateway with Telegram, memory, shell and cron tools",
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
    copy: "Hospital voice interpreter on Alebex Voice and Twilio",
    href: "https://github.com/linhoangce/alebex-hack",
  },
  {
    title: "Otto Judge",
    copy: "Pixel-art judge reacting live to hackathon scores. Codechella Victoria 2026, team project",
    href: "https://github.com/nhepner1/judgejudgejudge",
  },
  { title: "JobBee", copy: "Job-search agent. Local only, no public link yet" },
];

export const roles: Role[] = [
  {
    period: "2025 — now",
    title: "Software QA Engineer Intern",
    detail: "Playwright, Java and Jenkins. Kafka, MQTT and TR-069 on multi-VM Linux.",
  },
  { period: "2021 — 2023", title: "Medical Interpreter, Level 4", detail: "English and Vietnamese, clinical settings." },
  { period: "2019 — 2020", title: "Project Manager", detail: "Launched a new cafe concept. Sales up 166 percent." },
  {
    period: "2018 — 2019",
    title: "Training & Development Specialist",
    detail: "Lean programs across stores. Sales up 198 percent.",
  },
  { period: "2014 — 2016", title: "Operations Supervisor", detail: "Scheduling, training and service standards." },
];

export const contact = {
  heading: "Let's talk.",
  body: "The fastest way to reach me is email. I reply within a day. For the long version, the resume is one page.",
  email: "linhoang.ce@gmail.com",
  github: "https://github.com/linhoangce",
  linkedin: "https://www.linkedin.com/in/lhoang-bcit/",
  resume: "/resume.pdf",
};

// ---------------------------------------------------------------------------
// The line: real Expo Line stations, Waterfront to Patterson, one section each.
// km east / south of Waterfront (OpenStreetMap; Patterson from its published coordinates).
// ---------------------------------------------------------------------------

export const stations: Station[] = [
  {
    id: "waterfront",
    code: "00",
    name: "Waterfront",
    section: "Depart",
    km: [0, 0],
    panel: "depart",
    corpus:
      "Waterfront station, the start of the line: Linh Hoang. Software developer, ML systems. BCIT Computer Systems Technology graduate 2026, based in Vancouver, BC. Now: Software QA Engineer intern and competing in the Kaggle Gemma 4 Developer Agent competition.",
  },
  {
    id: "burrard",
    code: "01",
    name: "Burrard",
    section: "About",
    km: [-0.552, 0.06],
    panel: "about",
    corpus:
      "Burrard station, About: BCIT Computer Systems Technology graduate (2026) with ten years of leadership and client-service experience before software. Likes systems that are honest about their limits: deterministic cores, LLMs at the edges, and a human approving anything that goes out. Skills. ML/AI: Python, PyTorch, scikit-learn, DINOv2, YOLO, OpenAI and Claude APIs. Backend: FastAPI, Node.js, PostgreSQL, Prisma, SQLite, Azure. Frontend: TypeScript, React, Next.js, Tailwind, Three.js. Tooling: Claude Code, Playwright, Docker, Git, GCP.",
  },
  {
    id: "granville",
    code: "02",
    name: "Granville",
    section: "Experience",
    km: [-0.278, 0.328],
    panel: "experience",
    corpus:
      "Granville station, Experience: 2025 to now Software QA Engineer Intern (Playwright, Java, Jenkins; Kafka, MQTT and TR-069 on multi-VM Linux). 2021 to 2023 Medical Interpreter Level 4, English and Vietnamese. 2019 to 2020 Project Manager, launched a new cafe concept, sales up 166 percent. 2018 to 2019 Training and Development Specialist, lean programs, sales up 198 percent. 2014 to 2016 Operations Supervisor.",
  },
  {
    id: "stadium",
    code: "03",
    name: "Stadium–Chinatown",
    section: "Awdon",
    km: [0.211, 0.754],
    panel: "awdon",
    corpus:
      "Stadium–Chinatown station, Awdon (Cursor Hackathon Vancouver 2026, won Best Use of CLoD, now in early access at awdon.app). Turns meeting transcripts into sprint tasks and team documents; a PM approves before anything is sent. Imports Zoom, Teams and Meet transcripts, fills the team's own .docx or Google Doc templates, proposes Jira board changes with undo and a decision log. Stack: FastAPI, React, TypeScript, SQLite, LLM agents, Jira, Google Docs. Links: https://awdon.app and Devpost https://devpost.com/software/sidekik-aq0ybu.",
  },
  {
    id: "mainstreet",
    code: "04",
    name: "Main Street–Science World",
    section: "Planktoneer",
    km: [0.855, 1.449],
    panel: "planktoneer",
    corpus:
      "Main Street–Science World station, Planktoneer (OceanHackWeek 2026, four-day build). Turns imaging flow-cytometer data from Bamfield, BC into cells per litre for four harmful algae, compared against action levels. Frozen DINOv2 features with gradient-boosted heads; held-out AP 0.99, 0.95, 0.84 and 0.63; a domain gate refuses foreign water. Stack: PyTorch, DINOv2, scikit-learn, XGBoost, Streamlit. GitHub https://github.com/oceanhackweek/ohw26_proj_planktoneer.",
  },
  {
    id: "commercial",
    code: "05",
    name: "Commercial–Broadway",
    section: "Vessel Vision",
    km: [3.13, 2.705],
    panel: "vessel-vision",
    corpus:
      "Commercial–Broadway station, Vessel Vision (Ocean Hackathon Victoria 2025). YOLO plus SAHI multi-scale vessel detection in high-resolution coastal imagery, deployed as a public Hugging Face Space at https://huggingface.co/spaces/linhoang/yolo_boat_detector. Stack: YOLO, SAHI, PyTorch, Hugging Face.",
  },
  {
    id: "nanaimo",
    code: "06",
    name: "Nanaimo",
    section: "AI Weed Detector",
    km: [4.08, 4.194],
    panel: "weed-detector",
    corpus:
      "Nanaimo station, AI Weed Detector (industry-sponsored, BCIT). Collected and labelled a custom blueberry-field dataset, then built and evaluated an RF-DETR detection pipeline: 0.64 mAP@50 and 0.68 F1. Stack: RF-DETR, Roboflow, Weights & Biases, Colab.",
  },
  {
    id: "29th",
    code: "07",
    name: "29th Avenue",
    section: "ABCKidz",
    km: [4.814, 4.667],
    panel: "abckidz",
    corpus:
      "29th Avenue station, ABCKidz (production, abckidz.org). REST API backend for a children's learning platform: role-based access control, Prisma/Postgres models, Azure GPT-4o chatbot with prompt caching, streamed Azure Blob uploads up to 100 MB. Stack: TypeScript, PostgreSQL, Prisma, Azure. Live at https://www.abckidz.org/.",
  },
  {
    id: "joyce",
    code: "08",
    name: "Joyce–Collingwood",
    section: "More projects",
    km: [5.848, 5.317],
    panel: "more-projects",
    corpus:
      "Joyce–Collingwood station, More projects. Also built: Mini OpenClaw (AI assistant gateway with Telegram, memory, shell and cron tools, https://github.com/linhoangce/mini_openclaw), LEXMind (voice legal assistant on OpenAI Realtime with an Obsidian vault, https://github.com/linhoangce/law-hacks), Unidentified (private identity handoff for agent transactions, https://github.com/linhoangce/Unidentified), An (hospital voice interpreter on Alebex Voice and Twilio, https://github.com/linhoangce/alebex-hack), Otto Judge (pixel-art judge reacting live to hackathon scores, Codechella Victoria 2026 team project, https://github.com/nhepner1/judgejudgejudge), JobBee (job-search agent, local only).",
  },
  {
    id: "patterson",
    code: "09",
    name: "Patterson",
    section: "Contact",
    km: [7.193, 6.224],
    panel: "contact",
    corpus:
      "Patterson station, the terminus for this portfolio, Contact: email linhoang.ce@gmail.com (fastest, replies within a day), GitHub https://github.com/linhoangce, LinkedIn https://www.linkedin.com/in/lhoang-bcit/, resume PDF on the site.",
  },
];

export const projectById = Object.fromEntries(featured.map((p) => [p.id, p])) as Record<ProjectId, Project>;
export const stationById = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, Station>;
export const stationIndex = (id: StationId): number => stations.findIndex((s) => s.id === id);
