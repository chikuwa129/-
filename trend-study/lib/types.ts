export type Keyword = { term: string; explanation: string };

export type Article = {
  id: number;
  link: string;
  title: string;
  snippet: string;
  source_id: string;
  source_name: string;
  role: string;
  bookmarks: number | null;
  published_at: string | null;
  fetched_at: string;
  summary: string | null;
  keywords: Keyword[] | null;
  reason: string | null;
  recommended_on: string | null;
  favorite: boolean;
  read_later: boolean;
  opened_at: string | null;
  tags: string[] | null;
};

export type StudyIdea = {
  title: string;
  why: string;
  steps: string[];
  time: string;
  articleIds: number[];
};

export type Digest = {
  date: string;
  overview: string;
  highlights: string[];
};

export type TermCount = { term: string; count: number };

export type RisingWord = { term: string; count: number; average: number };
