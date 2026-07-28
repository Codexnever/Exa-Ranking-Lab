export const CATEGORY_MAP = {
  company: "Company",
  news: "News",
  research_paper: "Research Paper",
  github: "GitHub",
  pdf: "PDF",
  tweet: "Tweet",
  personal_site: "Personal Site",
  linkedin_profile: "LinkedIn Profile",
  financial_report: "Financial Report",
} as const;

export type ExaCategory = keyof typeof CATEGORY_MAP;

export const VALID_CATEGORIES = Object.keys(
  CATEGORY_MAP
) as ExaCategory[];

export const CATEGORY_MAP_REVERSE = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([k, v]) => [v, k])
) as Record<string, ExaCategory>;