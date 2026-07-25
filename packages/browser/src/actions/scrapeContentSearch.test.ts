// @vitest-environment jsdom
//
// Regression test for LinkedIn's current content-search result DOM captured
// during live production verification in July 2026. The content cards are
// obfuscated <div role="listitem"> nodes with component keys ending in
// FeedType_FLAGSHIP_SEARCH; the old feed-shared selectors are absent.
import { describe, expect, it } from "vitest";
import { extractPostCards } from "./scrapeContentSearch.js";

function pageStub() {
  return {
    evaluate: async (fn: () => unknown) => fn(),
  };
}

describe("extractPostCards", () => {
  it("extracts current LinkedIn content-search cards with obfuscated classes", async () => {
    document.documentElement.innerHTML = `
      <main>
        <div role="listitem" componentkey="expandedabcFeedType_FLAGSHIP_SEARCH">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/in/guha-suman/"></a>
          <a href="https://www.linkedin.com/in/guha-suman/">Suman Guha • 3rd+</a>
          <span>Chief Digital Officer Tata(Croma), 2x CPTO</span>
          <span>1h • Edited • Follow</span>
          <p>
            Why Hiring AI Agents Like Humans Is a $10B Mistake. Meet Ella:
            the AI Agent Who Walked Among Us.
          </p>
          <a href="https://www.linkedin.com/pulse/why-hiring-ai-agents-like-humans-10b-mistake-suman-guha-br8af/">
            recodeai Subscribe Why Hiring AI Agents Like Humans Is a $10B Mistake
          </a>
          <button>Like</button><button>Comment</button><button>Repost</button><button>Send</button>
        </div>
        <div role="listitem" componentkey="expandeddefFeedType_FLAGSHIP_SEARCH">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/in/dharanikandasamy/"></a>
          <a href="https://www.linkedin.com/in/dharanikandasamy/">DHARANI KC • 3rd+</a>
          <span>Student at SNS Institutions</span><span>3h • Follow</span>
          <p>AI Agents: The Future of Digital Assistants</p>
          <a href="https://www.linkedin.com/pulse/ai-agents-future-digital-assistants-dharani-kc-dpu2c/">
            AI Agents: The Future of Digital Assistants
          </a>
        </div>
      </main>
    `;

    const cards = await extractPostCards(pageStub() as never, "AI agents");

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      authorUrl: "https://www.linkedin.com/in/guha-suman",
      firstName: "Suman",
      lastName: "Guha",
      title: "Chief Digital Officer Tata(Croma), 2x CPTO",
      postUrl:
        "https://www.linkedin.com/pulse/why-hiring-ai-agents-like-humans-10b-mistake-suman-guha-br8af",
    });
    expect(cards[0].excerpt).toContain("AI Agents");
    expect(cards[0].publishedAt.getTime()).toBeGreaterThan(
      Date.now() - 2 * 60 * 60_000,
    );
    expect(cards[1]).toMatchObject({
      authorUrl: "https://www.linkedin.com/in/dharanikandasamy",
      firstName: "DHARANI",
      lastName: "KC",
      title: "Student",
      company: "SNS Institutions",
    });
  });
});
