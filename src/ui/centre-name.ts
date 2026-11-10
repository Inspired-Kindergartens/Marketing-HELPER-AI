// Short centre name for tables: "Arataki  Kindergarten" -> "Arataki".
export function formatAnalyticsServiceDisplayName(serviceName: string) {
  return serviceName.replace(/\s*Kindergarten[\s\S]*$/i, "").trim() || serviceName;
}
