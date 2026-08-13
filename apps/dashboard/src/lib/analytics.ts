import posthog from "posthog-js";
import type { AuthUser } from "@/lib/api";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
  initialized = true;
}

export function identifyUser(user: AuthUser) {
  if (!initialized) return;
  posthog.identify(user.id, {
    email: user.email,
    plan: user.plan,
    is_admin: Boolean(user.isAdmin),
  });
}

export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

export function trackPageview(url: string) {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: url });
}

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

// Event names mirror the product analytics blueprint's funnel/event taxonomy —
// keep this list in sync with docs/analytics blueprint if that changes.
export const EVENTS = {
  // Authentication
  SIGNUP_STARTED: "Signup Started",
  SIGNUP_COMPLETED: "Signup Completed",
  EMAIL_VERIFIED: "Email Verified",
  LOGIN: "Login",

  // Onboarding
  IMPORTED_LINKEDIN_COOKIES: "Imported LinkedIn Cookies",
  CONNECTED_OAUTH: "Connected OAuth",
  CONNECTED_PROXY: "Connected Proxy",

  // Campaigns
  CREATED_CAMPAIGN: "Created Campaign",
  GENERATED_AI_CAMPAIGN: "Generated AI Campaign",
  // Fired on every manual add; use PostHog's "first occurrence per user"
  // when building the activation funnel rather than a separate event name.
  ADDED_LEAD: "Added Lead",
  IMPORTED_CSV: "Imported CSV",
  SCRAPED_LEADS: "Scraped Leads",
  BUILT_SEQUENCE: "Built Sequence",
  LAUNCHED_CAMPAIGN: "Launched Campaign",
  PAUSED_CAMPAIGN: "Paused Campaign",
  COMPLETED_CAMPAIGN: "Completed Campaign",

  // AI
  GENERATED_AI_POST: "Generated AI Post",
  GENERATED_IMAGE: "Generated Image",
  REFINED_POST: "Refined Post",

  // Content
  CREATED_POST: "Created Post",
  SCHEDULED_POST: "Scheduled Post",
  PUBLISHED_POST: "Published Post",

  // Engagement
  VIEWED_DASHBOARD: "Viewed Dashboard",
  VIEWED_LEADS: "Viewed Leads",
  VIEWED_CAMPAIGN: "Viewed Campaign",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];
