export interface SearchLead {
  linkedinUrl: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
}

export type SearchSource = "LINKEDIN" | "SALES_NAVIGATOR";

// Runs inside the browser via page.evaluate — it must stay fully
// self-contained: no imports, no closure references, browser globals only.
export function collectSearchLeads(searchSource: SearchSource): SearchLead[] {
  let cards = Array.from(
    document.querySelectorAll(
      searchSource === "SALES_NAVIGATOR"
        ? "li, .artdeco-list__item"
        : ".reusable-search__result-container, .entity-result, div[data-chameleon-result-urn]"
    )
  );

  // LinkedIn periodically ships search results with obfuscated class names.
  // Fall back to finding profile links inside the main results area and
  // treating each enclosing list item as a result card. Result rows are
  // <div role="listitem"> in the current markup, not <li>.
  if (cards.length === 0 && searchSource === "LINKEDIN") {
    const root = document.querySelector("main") ?? document;
    const items = new Set<Element>();
    for (const a of Array.from(root.querySelectorAll("a[href*='/in/']"))) {
      items.add(a.closest("li, [role='listitem']") ?? a);
    }
    cards = Array.from(items);
  }

  const directText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");

  return cards
    .map((card) => {
      const anchorSelector =
        searchSource === "SALES_NAVIGATOR"
          ? "a[href*='/sales/lead/'], a[href*='/in/']"
          : "a[href*='/in/']";
      const anchors = card.matches(anchorSelector)
        ? [card as HTMLAnchorElement]
        : (Array.from(card.querySelectorAll(anchorSelector)) as HTMLAnchorElement[]);

      // A card usually has several profile links (avatar + name); the one
      // carrying the person's name as direct text is the name link.
      const anchor = anchors.find((a) => directText(a)) ?? anchors[0] ?? null;

      if (!anchor) return null;

      const href = anchor.href;
      const linkedinUrl = (() => {
        try {
          const url = new URL(href);
          url.search = "";
          url.hash = "";
          return url.toString().replace(/\/$/, "");
        } catch {
          return href.split("?")[0].replace(/\/$/, "");
        }
      })();

      const fullName =
        card
          .querySelector(
            ".entity-result__title-text a span[aria-hidden='true']"
          )
          ?.textContent?.trim() ??
        card
          .querySelector("[data-anonymize='person-name']")
          ?.textContent?.trim() ??
        (directText(anchor) ||
          anchor.querySelector("span[aria-hidden='true']")?.textContent?.trim() ||
          anchor.textContent?.trim().replace(/\s+/g, " ") ||
          card.querySelector(".actor-name")?.textContent?.trim() ||
          null);

      const [firstName = null, ...rest] = fullName?.split(" ") ?? [];
      const lastName = rest.join(" ") || null;

      const title =
        card
          .querySelector(".entity-result__primary-subtitle")
          ?.textContent?.trim() ??
        card.querySelector("[data-anonymize='title']")?.textContent?.trim() ??
        card.querySelector("div.t-14.t-black.t-normal")?.textContent?.trim() ??
        null;

      const company =
        card
          .querySelector(".entity-result__secondary-subtitle")
          ?.textContent?.trim() ??
        card.querySelector("[data-anonymize='company-name']")?.textContent?.trim() ??
        null;

      return { linkedinUrl, firstName, lastName, title, company };
    })
    .filter(
      (l): l is SearchLead =>
        !!l &&
        !!l.linkedinUrl &&
        (l.linkedinUrl.includes("/in/") || l.linkedinUrl.includes("/sales/lead/"))
    );
}
