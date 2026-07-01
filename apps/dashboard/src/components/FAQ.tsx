"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Is Vectra safe for LinkedIn outreach?",
    a: "No automation tool can remove platform risk. Vectra reduces avoidable risk with warm-up enforcement, hard daily caps, timezone-aware scheduling, residential proxies, checkpoint pauses, and visible account health before jobs run.",
  },
  {
    q: "Why does each account need a proxy?",
    a: "LinkedIn accounts should behave consistently. Vectra requires one residential proxy per account, matched to the account's normal location, and blocks browser jobs until the exit IP is verified.",
  },
  {
    q: "How does warm-up work?",
    a: "New accounts ramp over 4 weeks: manual-only first, then 5 connection requests per day, then 10, then the full 15-per-day ceiling. Campaigns cannot override the current warm-up phase.",
  },
  {
    q: "What can I run in Vectra?",
    a: "You can run connect campaigns, message campaigns, LinkedIn search scrapes, and Content Signal campaigns that find people who recently posted about a keyword.",
  },
  {
    q: "What is Content Signal?",
    a: "Content Signal finds LinkedIn profiles who recently posted about a topic you care about, stores the post context beside the lead, and helps generate connection notes that reference what they actually wrote.",
  },
  {
    q: "What happens if LinkedIn shows a checkpoint?",
    a: "Vectra stops all jobs for that account immediately. It does not retry, work around the screen, or continue the queue. The account stays paused until a human resolves and reviews it.",
  },
  {
    q: "Can I scale to multiple accounts?",
    a: "Yes, but each account runs independently. Every account needs its own residential proxy, warm-up phase, daily caps, checkpoint status, and activity history.",
  },
  {
    q: "Where do leads come from?",
    a: "Leads can be imported by CSV, entered manually, scraped from LinkedIn search result URLs, or generated through Content Signal campaigns.",
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
