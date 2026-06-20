export const CATEGORY_MAP = {
  "company": "company",
  "Research paper": "research paper",
  "News": "News",
  "pdf": "pdf",
  "GitHub": "GitHub",
  "tweet": "tweet",
  "personal site": "personal site",
  "linkedin profile": "linkedin_profile",
  "financial report": "financial_report"
} as const;

export const CATEGORY_MAP_REVERSE = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k])
) as Record<string, string>;
