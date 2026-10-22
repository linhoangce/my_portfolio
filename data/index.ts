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

/** A card under a project: a real figure, or (where a project has none to show) a feature or result in a few words. */
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
  /** Real figures, or the project's key features and results; never invented numbers. */
  metrics: Metric[];
  tags: string[];
  links: ProjectLink[];
  /** Screenshot under /public; M2 adds the full set. */
  shot?: Shot;
};

export type MiniProject = { title: string; copy: string; href?: string };

export type Role = {
  period: string;
  title: string;
  detail: string;
  /** A shorter title for the scene's caption, where the full one would not fit. */
  short?: string;
};


export type Station = {
  id: StationId;
  /** Two-digit code shown on the line map and the door labels. */
  code: string;
  /** Real station name: on the screen-door labels, the readout and in the attendant's notes. */
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
  tagline: "Software developer · Co-founder, Awdon · BCIT Computer Systems Technology 2026",
  url: "https://linh-hoang.vercel.app",
};

export const intro = {
  kicker: "Portfolio",
  lead: "Software developer building ML systems and LLM agents that are honest about their limits. The work sits at ten stops along the Expo Line through an imagined Vancouver, 2100, Waterfront to Patterson.",
};

export const depart = {
  title: "Linh Hoang",
  lead: "Software developer building ML systems and LLM agents that are honest about their limits: deterministic cores, models at the edges, and a human approving what goes out.",
  meta: ["BCIT Computer Systems Technology · 2026", "Now: Co-founder, Awdon · awdon.app"],
  body: "Ten stops on this line: who I am, where I have worked, five projects with the numbers behind them, more I have built, and how to reach me.",
};

export const about = {
  title: "From test automation to AI products.",
  bio: "I co-founded Awdon, an AI-native workspace for small software agencies, and built its FastAPI backend, React front end and a multi-provider LLM pipeline with MCP and tool integrations. Before that I was a Software QA Engineer at Incognito Software Systems, owning Jenkins and the CI/CD pipeline and building Java test frameworks on Playwright and JUnit. I like systems that are honest about their limits: deterministic cores, LLMs at the edges, and a human approving anything that goes out.",
  now: "Now: Co-founder, Awdon · awdon.app",
  tools: ["Python", "TypeScript", "scikit-learn", "PyTorch", "Claude Code"],
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
      { value: "Calls → tasks", label: "Transcripts update the board" },
      { value: "Your templates", label: "Fills the team's own docs" },
      { value: "PM approves", label: "Before anything is sent" },
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
      { value: "Tiny boats", label: "Found in full scenes" },
      { value: "Tiled passes", label: "Overlapping tiles, merged" },
      { value: "Live demo", label: "Public on Hugging Face" },
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

/** Newest first. The Experience stop raises one portal per role, its start year on the lintel. */
export const roles: Role[] = [
  {
    period: "2026 — now",
    title: "Co-Founder, Awdon",
    detail:
      "An AI-native workspace that turns client meetings into an updated project plan and drafts the reports a team needs. FastAPI and React, a two-pass LLM pipeline with failover across four providers, a 15-tool MCP connector, and a 2,500-test pytest suite in CI.",
  },
  {
    period: "2025 — 2026",
    title: "Software QA Engineer, Incognito Software Systems",
    short: "QA Engineer, Incognito",
    detail: "Owned Jenkins CI/CD, built Java test frameworks on Playwright and JUnit, and ran the RHEL/CentOS test environments.",
  },
  { period: "2019 — 2020", title: "Project Manager, Haviland House", detail: "Led the operations transition: sales up 166 percent, monthly profit 320 percent over target." },
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
      "Waterfront station, the start of the line: Linh Hoang. Software developer and co-founder of Awdon (awdon.app). BCIT Computer Systems Technology graduate 2026 (Predictive Analytics), based in Vancouver, BC.",
  },
  {
    id: "burrard",
    code: "01",
    name: "Burrard",
    section: "About",
    km: [-0.552, 0.06],
    panel: "about",
    corpus:
      "Burrard station, About: co-founder of Awdon, an AI-native workspace for small software agencies (FastAPI backend, React front end, multi-provider LLM pipeline with MCP and tool integrations). Before that, Software QA Engineer at Incognito Software Systems (owned Jenkins and the CI/CD pipeline, built Java test frameworks on Playwright and JUnit). Likes systems that are honest about their limits: deterministic cores, LLMs at the edges, and a human approving anything that goes out. Favourite tools: Python, TypeScript, scikit-learn, PyTorch and Claude Code.",
  },
  {
    id: "granville",
    code: "02",
    name: "Granville",
    section: "Experience",
    km: [-0.278, 0.328],
    panel: "experience",
    corpus:
      "Granville station, Experience: June 2026 to now, Co-Founder of Awdon (awdon.app), an AI-native workspace that turns client meeting transcripts into an updated project plan and drafts reports, minutes, timesheets and emails with human approval; FastAPI/SQLAlchemy backend and React/TypeScript front end around a concurrent two-pass LLM pipeline, integrations with Zoom, Teams, Google Meet, Slack, Gmail/Outlook, GitHub and Jira, a VS Code extension, a Claude Code hook and a 15-tool MCP connector, failover across four LLM providers, one Docker image on Render with SQLite replicated to Cloudflare R2, a 2,500-test pytest suite in GitHub Actions; grew out of Sidekik, Cursor Hackathon Vancouver 2026, Best Use of CLoD. January 2025 to May 2026, Software QA Engineer at Incognito Software Systems: owned Jenkins setup and administration with automated test stages in CI/CD, built Java test frameworks with Playwright and JUnit, managed RHEL/CentOS test environments. September 2019 to February 2020, Project Manager at Haviland House: led the operations transition, sales up 166 percent, expenses under 25 percent of budget, monthly profit 320 percent over target.",
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
    km: [3.13, 2.6545],
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
      "Joyce–Collingwood station, More projects, shown as the Project Gallery (an exhibition hall by the station): Mini OpenClaw (AI assistant gateway with Telegram, memory, shell and cron tools, https://github.com/linhoangce/mini_openclaw), LEXMind (voice legal assistant on OpenAI Realtime with an Obsidian vault, https://github.com/linhoangce/law-hacks), An (hospital voice interpreter on Alebex Voice and Twilio, https://github.com/linhoangce/alebex-hack), Otto Judge (pixel-art judge reacting live to hackathon scores, Codechella Victoria 2026 team project, https://github.com/nhepner1/judgejudgejudge), JobBee (job-search agent, local only).",
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
