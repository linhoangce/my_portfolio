"use client";

import { FileText, Menu as MenuIcon } from "lucide-react";
import Link from "next/link";

import { BlossomMark } from "@/components/brand/BlossomMark";
import { person } from "@/data";

import { useTrain } from "../store";
import { ThemeToggle } from "./ThemeToggle";

/** A skip link to the text version, the wordmark (back to the first stop), then Resume (the text version), theme and menu (not on phones). */
export function TopBar() {
  const ui = useTrain((s) => s.ui);
  const driveTo = useTrain((s) => s.driveTo);
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
        <BlossomMark />
        <span className="name">{person.name}</span>
      </a>
      <div className="right">
        <Link href="/text" className="btn" aria-label="Resume">
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span className="label">Resume</span>
        </Link>
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
