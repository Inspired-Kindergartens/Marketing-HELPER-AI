export type MailchimpEnv = {
  MAILCHIMP_API_KEY?: string | null;
  MAILCHIMP_SERVER_PREFIX?: string | null;
};

export type MailchimpConfig = {
  apiKey: string;
  serverPrefix: string;
  baseUrl: string;
};

export type MailchimpConfigStatus = {
  isConfigured: boolean;
  missingKeys: string[];
  serverPrefix: string | null;
};

const SERVER_PREFIX_PATTERN = /^[a-z]{2}\d{1,3}$/;

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

function extractServerPrefix(rawValue: string | null, apiKey: string | null): string | null {
  // Accept a bare prefix ("us14"), a hostname ("us14.admin.mailchimp.com"),
  // or a full URL ("https://us14.admin.mailchimp.com/").
  if (rawValue) {
    const trimmed = rawValue.trim().toLowerCase();

    if (SERVER_PREFIX_PATTERN.test(trimmed)) {
      return trimmed;
    }

    const hostMatch = trimmed.match(/^(?:https?:\/\/)?([a-z]{2}\d{1,3})\./);
    if (hostMatch) {
      return hostMatch[1];
    }
  }

  // Mailchimp API keys carry the data-centre prefix as their suffix
  // ("abcd...-us14"), so use that as a fallback.
  if (apiKey) {
    const suffixMatch = apiKey.trim().match(/-([a-z]{2}\d{1,3})$/i);
    if (suffixMatch) {
      return suffixMatch[1].toLowerCase();
    }
  }

  return null;
}

export function readMailchimpConfigStatus(env: MailchimpEnv): MailchimpConfigStatus {
  const apiKey = normalizeEnvValue(env.MAILCHIMP_API_KEY);
  const serverPrefix = extractServerPrefix(
    normalizeEnvValue(env.MAILCHIMP_SERVER_PREFIX),
    apiKey,
  );
  const missingKeys: string[] = [];

  if (!apiKey) {
    missingKeys.push("MAILCHIMP_API_KEY");
  }

  if (!serverPrefix) {
    missingKeys.push("MAILCHIMP_SERVER_PREFIX");
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    serverPrefix,
  };
}

export function getMailchimpConfig(env: MailchimpEnv): MailchimpConfig {
  const apiKey = normalizeEnvValue(env.MAILCHIMP_API_KEY);
  const status = readMailchimpConfigStatus(env);

  if (!apiKey || !status.isConfigured || !status.serverPrefix) {
    throw new Error(`Missing Mailchimp configuration: ${status.missingKeys.join(", ")}`);
  }

  return {
    apiKey,
    serverPrefix: status.serverPrefix,
    baseUrl: `https://${status.serverPrefix}.api.mailchimp.com/3.0`,
  };
}
