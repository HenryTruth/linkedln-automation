// @vitest-environment jsdom
//
// Regression test for LinkedIn search-result extraction. The fixture is the
// real DOM of a LinkedIn people-search results page captured from a
// production Playwright trace (July 2026): fully obfuscated class names,
// result rows as <div role="listitem"> instead of <li>, and names as direct
// text children of the profile anchor. The legacy `.entity-result` markup is
// long gone — this pins the fallback path that production depends on.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { collectSearchLeads } from "./extractSearchLeads.js";

// DOM test environments can replace the global URL class, so resolve the
// fixture path from the module URL string rather than a constructed URL.
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "linkedin-search-2026.html"
);

describe("collectSearchLeads on captured 2026 LinkedIn search DOM", () => {
  beforeAll(() => {
    document.documentElement.innerHTML = readFileSync(fixturePath, "utf8");
  });

  it("extracts every result row despite obfuscated markup", () => {
    const leads = collectSearchLeads("LINKEDIN");

    expect(leads).toHaveLength(10);

    const names = leads.map((l) =>
      [l.firstName, l.lastName].filter(Boolean).join(" ")
    );
    expect(names).toEqual([
      "Monday Igwe",
      "Adebisi Folayan ACIPM",
      "Abdullahi Akilu MBBS, MBA, FMCPsych., Cert. LMIH",
      "Obinna Amaji",
      "Ayobami Adenusi",
      "Gbolahan Oke",
      "Sandra Asiegbu",
      "Oyinloluwa Ola-Obaado",
      "Chizaramekpere Nworgu",
      "Percy Farai Mukwacha",
    ]);
  });

  it("produces canonical profile URLs without query strings", () => {
    const leads = collectSearchLeads("LINKEDIN");

    for (const lead of leads) {
      expect(lead.linkedinUrl).toMatch(
        /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+$/
      );
    }
    // Every row is a distinct person.
    expect(new Set(leads.map((l) => l.linkedinUrl)).size).toBe(10);
  });
});
