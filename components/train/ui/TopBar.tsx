"use client";

import { FileText, Menu as MenuIcon, Sparkles } from "lucide-react";
import Link from "next/link";

import { contact, person } from "@/data";

import { useTrain } from "../store";
import { ThemeToggle } from "./ThemeToggle";

/** A skip link to the text version, the wordmark (back to the first stop), then Ask, the resume, theme and menu (not on phones). */
export function TopBar() {
  const askOpen = useTrain((s) => s.askOpen);
  const ui = useTrain((s) => s.ui);
  const driveTo = useTrain((s) => s.driveTo);
  const setAskOpen = useTrain((s) => s.setAskOpen);
  const setUi = useTrain((s) => s.setUi);

  return (
    <header className="top">
      <Link href="/text" className="skip">
        Read the text version
      </Link>
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          driveTo(0);
        }}
      >
        <span className="name">{person.name}</span>
      </a>
      <div className="right">
        <button type="button" className="btn-primary" onClick={() => setAskOpen(!askOpen)} aria-expanded={askOpen}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="label">Ask the attendant</span>
        </button>
        <a href={contact.resume} className="btn" aria-label="Resume" target="_blank" rel="noreferrer noopener">
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span className="label">Resume</span>
        </a>
        <ThemeToggle />
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={ui === "menu"}
          data-menu-toggle
          onClick={() => setUi(ui === "menu" ? null : "menu")}
        >
          <MenuIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
