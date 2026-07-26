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
          <a href="https://www.linkedin.com/in/guha-suman/">
            <span><span>Suman Guha • 3rd+</span></span>
          </a>
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

  it("only takes the first pipe-separated segment as company, not the whole tagline chain", async () => {
    // Regression: LinkedIn headlines often chain extra taglines after the
    // company with " | " separators, e.g. "Founder & CEO at Nexora AI | AI
    // Innovation & Digital Transformation" — the old code took everything
    // after "at" as the company, producing garbage like
    // "Nexora AI | Artificial Intelligence & Machine Learning | ...".
    document.documentElement.innerHTML = `
      <main>
        <div role="listitem" componentkey="expandedghiFeedType_FLAGSHIP_SEARCH">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/in/maya-exley/"></a>
          <a href="https://www.linkedin.com/in/maya-exley/">Maya Exley • 2nd</a>
          <span>Founder &amp; CEO at Nexora AI | Artificial Intelligence &amp; Machine Learning | Building Intelligent Software Solutions | AI Innovation &amp; Digital Transformation</span>
          <span>2d • Follow</span>
          <p>Excited to share our latest AI automation milestone.</p>
          <a href="https://www.linkedin.com/feed/update/urn:li:activity:1234567890/">
            Excited to share our latest AI automation milestone.
          </a>
        </div>
      </main>
    `;

    const cards = await extractPostCards(pageStub() as never, "AI automation");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      firstName: "Maya",
      lastName: "Exley",
      title: "Founder & CEO",
      company: "Nexora AI",
    });
  });

  it("keeps visible profile posts even when LinkedIn omits a permalink", async () => {
    document.documentElement.innerHTML = `
      <main>
        <div role="listitem" componentkey="expandedlivecardFeedType_FLAGSHIP_SEARCH">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/in/elizabeth-olawumi-5374283a7/"></a>
          <a href="https://www.linkedin.com/in/elizabeth-olawumi-5374283a7/">
            Elizabeth Olawumi • 3rd+
          </a>
          <span>AI Operations &amp; Workflow Automation Specialist | CRM, AI Systems &amp; Process Automation</span>
          <span>3h • Follow</span>
          <span data-testid="expandable-text-box">
            Working in automation has taught me something useful about AI systems.
          </span>
          <button>Like</button><button>Comment</button><button>Repost</button><button>Send</button>
        </div>
      </main>
    `;

    const cards = await extractPostCards(pageStub() as never, "AI automation");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      authorUrl: "https://www.linkedin.com/in/elizabeth-olawumi-5374283a7",
      firstName: "Elizabeth",
      lastName: "Olawumi",
      postUrl: "linkedin-search-card:expandedlivecardFeedType_FLAGSHIP_SEARCH",
    });
    expect(cards[0].excerpt).toContain("Working in automation");
  });

  it("builds a real feed URL from highlighted group result URNs", async () => {
    document.documentElement.innerHTML = `
      <main>
        <div role="listitem" componentkey="expandedgroupFeedType_FLAGSHIP_SEARCH">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/in/syed-kamran-mehdi/">Syed Kamran Mehdi • 3rd+</a>
          <span>Chief Executives: AI Strategy, Enterprise ROI &amp; Scale</span>
          <span>3d • Join</span>
          <p>AI is rapidly transforming engineering.</p>
          <a href="https://www.linkedin.com/groups/2153908/?q=highlightedFeedForGroups&amp;highlightedUpdateUrn=urn%3Ali%3Aactivity%3A7485923183502647297">
            Chief Executives: AI Strategy, Enterprise ROI &amp; Scale
          </a>
        </div>
      </main>
    `;

    const cards = await extractPostCards(pageStub() as never, "AI automation");

    expect(cards).toHaveLength(1);
    expect(cards[0].postUrl).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:7485923183502647297",
    );
  });
});
