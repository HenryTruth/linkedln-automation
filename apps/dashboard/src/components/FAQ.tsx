"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Will this get my LinkedIn account banned?",
    a: "No tool can guarantee that. Vectra is built to minimize detection risk through warm-up enforcement, hard daily caps, timezone-aware scheduling, stealth browser sessions, and residential proxies. LinkedIn automation carries inherent platform risk. Run it on accounts you can afford to lose.",
  },
  {
    q: "Do I need a proxy?",
    a: "Yes. Every account must be bound to a residential proxy in the same geographic location as the account's normal usage. Browser jobs are blocked until a proxy is assigned and its exit IP is verified.",
  },
  {
    q: "How does the warm-up phase work?",
    a: "New accounts ramp over 4 weeks: manual-only to start, then 5 connections per day, then 10, then the full 15-per-day cap. Each phase is enforced at the job level. Campaigns cannot override it, and the system will not advance phases early.",
  },
  {
    q: "What campaign types are available?",
    a: "Connect (send connection requests with optional notes), Message (send messages to existing connections), Scrape (collect lead data from LinkedIn search results), and Content Signal (find and reach out to people who recently posted about a specific keyword).",
  },
  {
    q: "What is Content Signal Targeting?",
    a: "A campaign type that finds LinkedIn profiles who posted about a specific keyword within a date window you choose. It extracts the post excerpt, stores it against the lead, and generates a personalized connection note referencing what they actually wrote.",
  },
  {
    q: "What happens when LinkedIn shows a checkpoint?",
    a: "All jobs for that account stop immediately. No retry, no workaround attempt. The account sits paused until you manually resolve the checkpoint and mark it reviewed. This behavior is enforced, not configurable.",
  },
  {
    q: "How many accounts can I run?",
    a: "There is no enforced limit on the number of accounts. Each account needs its own residential proxy and must complete its own warm-up phase independently before hitting full caps.",
  },
  {
    q: "Can I import my own leads?",
    a: "Yes. Leads can be added via CSV import, entered manually, scraped from LinkedIn search result URLs, or generated automatically through Content Signal campaigns.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <dl className="mt-12 divide-y divide-white/[0.08]">
      {faqs.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-6 py-5 text-left"
            aria-expanded={open === i}
          >
            <span className="text-base font-semibold text-white sm:text-lg">
              {item.q}
            </span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-500/40 bg-teal-500/10 text-teal-400 transition-transform duration-300"
              style={{ transform: open === i ? "rotate(45deg)" : "rotate(0deg)" }}
              aria-hidden
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M7 1v12M1 7h12" strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: open === i ? "200px" : "0px", opacity: open === i ? 1 : 0 }}
          >
            <p className="pb-6 text-sm leading-7 text-slate-400 sm:text-base sm:leading-8">
              {item.a}
            </p>
          </div>
        </div>
      ))}
    </dl>
  );
}
