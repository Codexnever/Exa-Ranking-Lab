export const CATEGORY_MAP = {
  "company": "company",
  "research paper": "research_paper",
  "news": "news",
  "pdf": "pdf",
  "github": "github",
  "tweet": "tweet",
  "personal site": "personal_site",
  "linkedin profile": "linkedin_profile",
  "financial report": "financial_report"
} as const;

export const CATEGORY_MAP_REVERSE = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k])
) as Record<string, string>;
