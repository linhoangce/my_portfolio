"use client";

/**
 * Bottom-right, small: the credit the map data asks for wherever it is shown (the streets, rail and parks are
 * OpenStreetMap's; the menu and the text version list every source).
 */
export function MapCredit() {
  return (
    <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
      © OpenStreetMap contributors
    </a>
  );
}
