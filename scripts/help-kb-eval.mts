// Retrieval check for the help knowledge base: runs questions with known
// answers through buildHelpGrounding and reports which ones retrieve the
// passage that answers them. Use it when changing FUSION_WEIGHTS, the chunking
// or a knowledge/ guide. Run with: npx tsx scripts/help-kb-eval.mts
import "dotenv/config";
import { buildHelpGrounding } from "../src/storage/help-kb-store.js";
import { prisma } from "../src/db.js";
const cfg = { ai: { AI_PROVIDER: "ollama" as const, AI_BASE_URL: "http://127.0.0.1:11434" }, embedModel: "nomic-embed-text", rootDir: process.cwd() };
const dash = { sources: ["infocare", "meta", "google-analytics"] as const, maxChunks: Number(process.env.DASH_N ?? 2), charBudget: Number(process.env.DASH_C ?? 2000) };
const mailchimp = { sources: ["mailchimp"] as const, maxChunks: 5, charBudget: 7000 };
const cases: Array<[string, any, string | RegExp]> = [
  ["how do i add a merge tag for first name", mailchimp, "FNAME"],
  ["How do I schedule a campaign to send tomorrow?", mailchimp, "Schedule"],
  ["What does Review spend mean on the dashboard?", dash, "Review spend: the waitlist"],
  ["Why does a centre say Prepare campaign?", dash, "Prepare campaign: 3 or more"],
  ["What does the Needs ads label mean?", dash, "Needs ads: 5 or more"],
  ["What does Learning Limited mean on our Meta ads?", dash, /Learning Limited: (the ad set is not getting|Meta says the ad set is unlikely to exit learning, because)/],
  ["How is the urgency score worked out?", dash, "Uncovered leavers"],
  ["What is engagement rate in Google Analytics?", dash, /Engagement rate: engaged sessions|engagement rate is the percentage of engaged sessions|percentage of engaged sessions/i],
];
for (const w of [[2, 0.5, 1, 1.5]]) {
  let hits = 0; const miss: string[] = [];
  for (const [q, o, needle] of cases) {
    const g = await buildHelpGrounding(cfg, q, { ...o, fusionWeights: w });
    if (g && (typeof needle === "string" ? g.text.includes(needle) : needle.test(g.text))) hits++; else miss.push(q.slice(0, 40));
  }
  console.log(JSON.stringify(w), `${hits}/${cases.length}`, miss.join(" | "));
}
await prisma.$disconnect();
