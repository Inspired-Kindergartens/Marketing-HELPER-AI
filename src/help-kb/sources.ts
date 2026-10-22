import {
  GOOGLE_ANALYTICS_HELP_START_URL,
  MAILCHIMP_SITEMAP_URL,
  extractGoogleAnalyticsLinks,
  extractHelpUrls,
  parseGoogleAnalyticsArticle,
  parseHelpArticle,
  type ParsedHelpArticle,
} from "./parse.js";

// The help sources the AI chats can draw on. Mailchimp and Google Analytics
// publish crawlable help centres. Meta's help centre and developer docs block
// automated requests, and Infocare has no public help centre, so those two are
// built from local documents: in-house guides in knowledge/<source>/, where
// help pages saved by hand can also be dropped.

export type HelpSourceId = "mailchimp" | "google-analytics" | "infocare" | "meta";

export const HELP_SOURCE_IDS: readonly HelpSourceId[] = ["mailchimp", "google-analytics", "infocare", "meta"];

export type FetchText = (url: string) => Promise<{ status: number; body: string }>;

export type CrawledPage = { url: string; article: ParsedHelpArticle | null };

type Logger = { warn: (payload: object, message?: string) => void };

export type HelpSourceDefinition = {
  // Shown with each excerpt in the grounding and in the chat's source list.
  label: string;
  // A question matching this is about the source even when the vector match is
  // weak (e.g. the embedder is down), so its help is still looked up.
  topic: RegExp;
  // Files or folders (relative to the repo root) indexed as local documents.
  localPaths: readonly string[];
  crawl?: {
    refreshAfterMs: number;
    // Fewer pages than this means a broken crawl, not a shrunken help centre,
    // so nothing is pruned on the strength of it.
    minPagesToPrune: number;
    pages: (fetchText: FetchText, log: Logger) => AsyncGenerator<CrawledPage>;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
// One request at a time with a pause between, so a crawl is a trickle rather
// than a burst.
export const CRAWL_DELAY_MS = 600;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function* crawlMailchimp(fetchText: FetchText, log: Logger): AsyncGenerator<CrawledPage> {
  const sitemap = await fetchText(MAILCHIMP_SITEMAP_URL);
  const urls = extractHelpUrls(sitemap.body);
  if (urls.length === 0) log.warn({ status: sitemap.status }, "Help sync: Mailchimp sitemap returned no help URLs");
  for (const url of urls) {
    try {
      const page = await fetchText(url);
      yield { url, article: page.body ? parseHelpArticle(page.body, url) : null };
    } finally {
      await pause(CRAWL_DELAY_MS);
    }
  }
}

// Google's help centre has no sitemap, so articles are found by following
// links outward from the help home: topic pages list answers, answers link to
// related answers. Bounded so a crawl cannot wander indefinitely.
const GOOGLE_ANALYTICS_MAX_FETCHES = 1500;

async function* crawlGoogleAnalytics(fetchText: FetchText): AsyncGenerator<CrawledPage> {
  const queue: string[] = [GOOGLE_ANALYTICS_HELP_START_URL];
  const queued = new Set(queue);
  let fetches = 0;

  while (queue.length > 0 && fetches < GOOGLE_ANALYTICS_MAX_FETCHES) {
    const url = queue.shift()!;
    fetches++;
    try {
      const page = await fetchText(url);
      const links = extractGoogleAnalyticsLinks(page.body);
      // Topics first: they fan out to whole areas of the help centre.
      for (const next of [...links.topics, ...links.answers]) {
        if (queued.has(next)) continue;
        queued.add(next);
        if (next.includes("/topic/")) queue.unshift(next);
        else queue.push(next);
      }
      if (url.includes("/answer/")) {
        yield { url, article: page.body ? parseGoogleAnalyticsArticle(page.body, url) : null };
      }
    } finally {
      await pause(CRAWL_DELAY_MS);
    }
  }
}

export const HELP_SOURCES: Record<HelpSourceId, HelpSourceDefinition> = {
  mailchimp: {
    label: "Mailchimp help",
    topic: /\b(mailchimp|audience|subscriber|unsubscribe|merge tag|segment|automation|customer journey|email template|send(ing)? (an? )?email|newsletter (send|design|template)|sign-?up form|bounce|open rate|click rate|tag(s|ging)? contacts?|import contacts?)\b/i,
    localPaths: ["knowledge/mailchimp"],
    crawl: { refreshAfterMs: 7 * DAY_MS, minPagesToPrune: 100, pages: crawlMailchimp },
  },
  "google-analytics": {
    label: "Google Analytics help",
    topic: /\b(google analytics|ga4|analytics|sessions?|engagement rate|engaged sessions?|active users|page ?views|key events?|conversions?|bounce rate|website traffic|traffic|utm|referr\w*|organic|source ?\/ ?medium|landing page)\b/i,
    localPaths: ["knowledge/google-analytics"],
    // Each Google help page is ~1.5MB, so the full crawl is kept to monthly.
    crawl: { refreshAfterMs: 30 * DAY_MS, minPagesToPrune: 100, pages: crawlGoogleAnalytics },
  },
  infocare: {
    label: "Infocare guide",
    topic: /\b(infocare|urgency|urgent|critical|waitlist|wait list|waiting list|enrol\w*|capacity|licen[cs]\w*|occupancy|fte|leavers?|leaving|turning (5|five)|approaching (5|five)|aged out|replacement pressure|actionable|booked|bookings?|utilisation)\b/i,
    localPaths: ["knowledge/infocare", "docs/metric-contracts.md", "INFOCARE/INFOCARE-LICENSE.md"],
  },
  meta: {
    label: "Meta Ads guide",
    topic: /\b(meta|facebook|instagram|ads? manager|ad ?sets?|adverts?|ads|cpm|cpc|ctr|cpr|cost per (click|result|lead)|reach|frequency|impressions|learning( limited)?|pixel|leads?|boost(ed)?|creative|objective|needs ads|ads active|review spend|prepare campaign|covered by ads)\b/i,
    localPaths: ["knowledge/meta"],
  },
};
