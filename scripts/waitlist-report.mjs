import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const INFOCARE_BASE_URL =
  process.env.INFOCARE_BASE_URL ??
  "https://infocare.digiweb.net.nz/charley/servlet/RubyServlet";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function calculateAgeInDays(dateValue, referenceDate) {
  if (!dateValue) {
    return null;
  }

  const value = new Date(dateValue);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const diffMs = referenceDate.getTime() - value.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(days)) {
    return null;
  }

  return Math.max(0, Math.floor(days));
}

async function requestInfocare(mode, parameters) {
  const response = await fetch(INFOCARE_BASE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      username: process.env.INFOCAREUSER,
      password: process.env.INFOCAREPASS,
      mode,
      parameters,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Infocare ${mode} failed with status ${response.status}: ${text}`);
  }

  const parsed = JSON.parse(text);

  if (String(parsed.msg_status ?? "").toLowerCase() === "error") {
    throw new Error(parsed.message ?? `Infocare ${mode} returned error.`);
  }

  return parsed;
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * fraction)),
  );

  return sortedValues[index];
}

function buildBucket(days) {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  return "366+";
}

function renderBar(count, maxCount) {
  if (count === 0 || maxCount === 0) {
    return "";
  }

  const width = Math.max(1, Math.round((count / maxCount) * 24));

  return "█".repeat(width);
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

async function main() {
  const now = new Date();
  const today = toIsoDateOnly(now);
  const centres = await prisma.centreReference.findMany({
    where: {
      ignored: false,
      openStatus: "Open",
    },
    orderBy: [{ name: "asc" }],
    select: {
      centreKey: true,
      name: true,
    },
  });

  const allEntries = [];
  const centreSummaries = [];
  const missingStartingDateEntries = [];
  const errors = [];

  for (const [index, centre] of centres.entries()) {
    try {
      const response = await requestInfocare("get_child_list", {
        centre_key: centre.centreKey,
        category: "Waiting list",
        start_date: today,
        end_date: today,
      });
      const childList = Array.isArray(response.child_list) ? response.child_list : [];
      const ages = [];
      let missingStartDateCount = 0;

      for (const child of childList) {
        const days = calculateAgeInDays(child.starting_date, now);

        if (days == null) {
          missingStartDateCount += 1;
          continue;
        }

        ages.push(days);
        allEntries.push({
          centreKey: centre.centreKey,
          centreName: centre.name,
          waitDays: days,
        });
      }

      if (missingStartDateCount > 0) {
        missingStartingDateEntries.push({
          centreName: centre.name,
          missingStartDateCount,
        });
      }

      const sortedAges = [...ages].sort((a, b) => a - b);
      centreSummaries.push({
        centreKey: centre.centreKey,
        centreName: centre.name,
        waitlistCount: childList.length,
        usableAgeCount: ages.length,
        missingStartDateCount,
        medianDays: percentile(sortedAges, 0.5),
        p75Days: percentile(sortedAges, 0.75),
        oldestDays: sortedAges.length > 0 ? sortedAges[sortedAges.length - 1] : null,
      });
    } catch (error) {
      errors.push({
        centreName: centre.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(index === centres.length - 1 ? 0 : 175);
  }

  const validDays = allEntries.map((entry) => entry.waitDays).sort((a, b) => a - b);
  const bucketCounts = new Map([
    ["0-7", 0],
    ["8-14", 0],
    ["15-30", 0],
    ["31-60", 0],
    ["61-90", 0],
    ["91-180", 0],
    ["181-365", 0],
    ["366+", 0],
  ]);

  for (const days of validDays) {
    bucketCounts.set(buildBucket(days), (bucketCounts.get(buildBucket(days)) ?? 0) + 1);
  }

  const maxBucketCount = Math.max(...bucketCounts.values(), 0);
  const medianDays = percentile(validDays, 0.5);
  const p25Days = percentile(validDays, 0.25);
  const p75Days = percentile(validDays, 0.75);
  const p90Days = percentile(validDays, 0.9);
  const averageDays =
    validDays.length > 0 ? round(validDays.reduce((sum, value) => sum + value, 0) / validDays.length, 1) : null;
  const oldestDays = validDays.length > 0 ? validDays[validDays.length - 1] : null;
  const totalWaitlistCount = centreSummaries.reduce((sum, centre) => sum + centre.waitlistCount, 0);
  const totalUsableAgeCount = centreSummaries.reduce((sum, centre) => sum + centre.usableAgeCount, 0);
  const totalMissingStartDateCount = centreSummaries.reduce((sum, centre) => sum + centre.missingStartDateCount, 0);
  const centresWithLongTail = centreSummaries
    .filter((centre) => (centre.oldestDays ?? 0) >= 180)
    .sort((a, b) => (b.oldestDays ?? 0) - (a.oldestDays ?? 0))
    .slice(0, 12);
  const biggestWaitlists = centreSummaries
    .filter((centre) => centre.waitlistCount > 0)
    .sort((a, b) => b.waitlistCount - a.waitlistCount || (b.oldestDays ?? 0) - (a.oldestDays ?? 0))
    .slice(0, 15);

  const lines = [];
  lines.push("# INFOCARE WAITLIST");
  lines.push("");
  lines.push(`Generated: ${now.toISOString()}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- Open centres checked: ${centres.length}`);
  lines.push(`- Waitlist entries returned across all centres: ${totalWaitlistCount}`);
  lines.push(`- Entries with usable wait-age data from \`starting_date\`: ${totalUsableAgeCount}`);
  lines.push(`- Entries missing usable \`starting_date\`: ${totalMissingStartDateCount}`);
  if (errors.length > 0) {
    lines.push(`- Centres skipped due to API errors: ${errors.length}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  if (totalUsableAgeCount === 0) {
    lines.push("No usable waitlist-age data was returned.");
  } else {
    lines.push(`- Median time on waitlist: ${medianDays} days`);
    lines.push(`- Average time on waitlist: ${averageDays} days`);
    lines.push(`- 25th percentile: ${p25Days} days`);
    lines.push(`- 75th percentile: ${p75Days} days`);
    lines.push(`- 90th percentile: ${p90Days} days`);
    lines.push(`- Oldest visible waitlist entry: ${oldestDays} days`);
  }
  lines.push("");
  lines.push("## Suggested Thresholds");
  lines.push("");
  if (totalUsableAgeCount > 0) {
    lines.push(`- Short wait: 0-${p25Days} days`);
    lines.push(`- Typical wait: ${p25Days + 1}-${p75Days} days`);
    lines.push(`- Long wait: ${p75Days + 1}-${p90Days} days`);
    lines.push(`- Very long wait: ${p90Days + 1}+ days`);
  } else {
    lines.push("- Not enough usable data to derive thresholds.");
  }
  lines.push("");
  lines.push("## Bell Curve");
  lines.push("");
  lines.push("| Days on waitlist | Count | Share | Distribution |");
  lines.push("|---|---:|---:|---|");
  for (const [bucket, count] of bucketCounts.entries()) {
    const share = totalUsableAgeCount > 0 ? round((count / totalUsableAgeCount) * 100, 1) : 0;
    lines.push(`| ${bucket} | ${count} | ${share}% | ${renderBar(count, maxBucketCount)} |`);
  }
  lines.push("");
  lines.push("## Centres With Largest Waitlists");
  lines.push("");
  lines.push("| Centre | Waitlist | Median days | 75th percentile | Oldest | Missing start dates |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const centre of biggestWaitlists) {
    lines.push(
      `| ${centre.centreName} | ${centre.waitlistCount} | ${centre.medianDays ?? "-"} | ${centre.p75Days ?? "-"} | ${centre.oldestDays ?? "-"} | ${centre.missingStartDateCount} |`,
    );
  }
  lines.push("");
  lines.push("## Centres With Long-Tail Waitlists");
  lines.push("");
  lines.push("| Centre | Waitlist | Oldest visible entry | Median days |");
  lines.push("|---|---:|---:|---:|");
  for (const centre of centresWithLongTail) {
    lines.push(
      `| ${centre.centreName} | ${centre.waitlistCount} | ${centre.oldestDays ?? "-"} | ${centre.medianDays ?? "-"} |`,
    );
  }
  lines.push("");
  lines.push("## Insights");
  lines.push("");
  if (totalUsableAgeCount > 0) {
    const over90 = validDays.filter((days) => days > 90).length;
    const over180 = validDays.filter((days) => days > 180).length;
    const over365 = validDays.filter((days) => days > 365).length;
    lines.push(`- The middle of the distribution sits around ${medianDays} days, so anything materially above ${p75Days} days is already outside the typical wait experience.`);
    lines.push(`- ${round((over90 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 90 days.`);
    lines.push(`- ${round((over180 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 180 days.`);
    lines.push(`- ${round((over365 / totalUsableAgeCount) * 100, 1)}% of usable waitlist entries have been waiting more than 365 days.`);
    if (totalMissingStartDateCount > 0) {
      lines.push(`- Some waitlist records do not expose a usable \`starting_date\`, so the age distribution is strong directional evidence rather than a perfect census.`);
    }
    if (centresWithLongTail.length > 0) {
      lines.push(`- A long tail exists in several centres, which supports using a "possible stale waitlist" message only when the queue is both very large and visibly old.`);
    }
    lines.push(`- A practical app threshold for "long time on a waitlist" would be above ${p75Days} days, with "very long" above ${p90Days} days.`);
  }
  lines.push("");
  if (missingStartingDateEntries.length > 0) {
    lines.push("## Centres With Missing Starting Dates");
    lines.push("");
    lines.push("| Centre | Missing start dates |");
    lines.push("|---|---:|");
    for (const centre of missingStartingDateEntries
      .sort((a, b) => b.missingStartDateCount - a.missingStartDateCount)
      .slice(0, 20)) {
      lines.push(`| ${centre.centreName} | ${centre.missingStartDateCount} |`);
    }
    lines.push("");
  }
  if (errors.length > 0) {
    lines.push("## API Errors");
    lines.push("");
    lines.push("| Centre | Error |");
    lines.push("|---|---|");
    for (const error of errors.slice(0, 20)) {
      lines.push(`| ${error.centreName} | ${error.message.replaceAll("|", "\\|")} |`);
    }
    lines.push("");
  }

  console.log(lines.join("\n"));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
