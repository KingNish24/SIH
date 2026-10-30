-- 0003: evaluator ratings collected at the end of the reviewer tour
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  technical INTEGER NOT NULL CHECK (technical BETWEEN 1 AND 5),
  scalability INTEGER NOT NULL CHECK (scalability BETWEEN 1 AND 5),
  innovation INTEGER NOT NULL CHECK (innovation BETWEEN 1 AND 5),
  presentation INTEGER NOT NULL CHECK (presentation BETWEEN 1 AND 5),
  comment TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_ip_created ON reviews (ip, created_at);
