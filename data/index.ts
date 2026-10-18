/**
 * Single source of truth for portfolio content.
 * Rendered by the station panels on / and by /text; edit copy here.
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

export const projectById = Object.fromEntries(featured.map((p) => [p.id, p])) as Record<string, Project>;
