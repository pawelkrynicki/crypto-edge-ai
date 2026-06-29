-- AI KINTEL Crypto Market Module - Database Blueprint
-- Stage 11B
-- REVIEW ONLY. DO NOT RUN ON PRODUCTION WITHOUT OWNER/DB REVIEW.
-- This file documents the proposed MySQL/MariaDB schema for the future AI KINTEL integration.
-- It does not activate sources, create cron jobs, add backend endpoints, or change the local RC.
--
-- JSON column note: MySQL and MariaDB both accept JSON syntax, but MariaDB may store JSON
-- as an alias/validated text depending on the deployed version. Validate JSON before insert.
-- Time note: production writers should store timestamps in UTC.

CREATE TABLE crypto_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(120) DEFAULT NULL,
  chain VARCHAR(80) DEFAULT NULL,
  contract_address VARCHAR(160) DEFAULT NULL,
  website_url VARCHAR(500) DEFAULT NULL,
  twitter_handle VARCHAR(120) DEFAULT NULL,
  description TEXT,
  market_cap_usd DECIMAL(28, 8) DEFAULT NULL,
  fdv_usd DECIMAL(28, 8) DEFAULT NULL,
  liquidity_usd DECIMAL(28, 8) DEFAULT NULL,
  volume_24h_usd DECIMAL(28, 8) DEFAULT NULL,
  launch_date DATE DEFAULT NULL,
  source VARCHAR(120) DEFAULT NULL,
  source_id VARCHAR(190) DEFAULT NULL,
  source_payload_hash VARCHAR(64) DEFAULT NULL,
  latest_scanner_label VARCHAR(80) DEFAULT NULL COMMENT 'Scanner output only; WATCHLIST means further manual review only.',
  security_label VARCHAR(80) DEFAULT NULL,
  risk_score DECIMAL(5, 2) DEFAULT NULL,
  research_score DECIMAL(5, 2) DEFAULT NULL COMMENT 'Research-only score; not investment advice or an automated decision layer.',
  research_summary TEXT,
  manual_verification_required BOOLEAN DEFAULT FALSE,
  missing_data JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  ai_analysis JSON COMMENT 'Optional future narrative/research layer only; not a decision layer.',
  hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_crypto_projects_symbol (symbol),
  INDEX idx_crypto_projects_chain (chain),
  INDEX idx_crypto_projects_category (category),
  INDEX idx_crypto_projects_contract_address (contract_address),
  INDEX idx_crypto_projects_latest_scanner_label (latest_scanner_label),
  INDEX idx_crypto_projects_security_label (security_label),
  INDEX idx_crypto_projects_risk_score (risk_score),
  INDEX idx_crypto_projects_research_score (research_score),
  INDEX idx_crypto_projects_source (source),
  INDEX idx_crypto_projects_source_id (source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Core registry/current project view for the AI KINTEL Crypto Market module.';

CREATE TABLE crypto_scam_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_symbol VARCHAR(32) DEFAULT NULL,
  project_name VARCHAR(255) DEFAULT NULL,
  contract_address VARCHAR(160) DEFAULT NULL,
  chain VARCHAR(80) DEFAULT NULL,
  alert_type VARCHAR(120) NOT NULL,
  severity ENUM('info', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  evidence_urls JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  source VARCHAR(120) DEFAULT NULL,
  source_id VARCHAR(190) DEFAULT NULL,
  is_confirmed BOOLEAN DEFAULT FALSE,
  manual_verification_required BOOLEAN DEFAULT TRUE,
  ai_analysis JSON COMMENT 'Optional future narrative/research layer only; not a decision layer.',
  hash VARCHAR(64) UNIQUE,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_crypto_scam_alerts_project_symbol (project_symbol),
  INDEX idx_crypto_scam_alerts_contract_address (contract_address),
  INDEX idx_crypto_scam_alerts_chain (chain),
  INDEX idx_crypto_scam_alerts_alert_type (alert_type),
  INDEX idx_crypto_scam_alerts_severity (severity),
  INDEX idx_crypto_scam_alerts_source (source),
  INDEX idx_crypto_scam_alerts_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Research risk/security/manual verification alerts; alerts are not trading instructions.';

CREATE TABLE crypto_opportunities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_symbol VARCHAR(32) DEFAULT NULL,
  project_name VARCHAR(255) DEFAULT NULL,
  opportunity_type VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  research_context TEXT,
  risk_level VARCHAR(80) DEFAULT NULL,
  confidence_score DECIMAL(5, 2) DEFAULT NULL,
  deadline TIMESTAMP NULL DEFAULT NULL,
  source_url VARCHAR(500) DEFAULT NULL,
  source VARCHAR(120) DEFAULT NULL,
  source_id VARCHAR(190) DEFAULT NULL,
  status ENUM('draft', 'active', 'needs_manual_verification', 'archived', 'disabled') NOT NULL DEFAULT 'draft',
  ai_analysis JSON COMMENT 'Optional future narrative/research layer only; not a decision layer.',
  hash VARCHAR(64) UNIQUE,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_crypto_opportunities_project_symbol (project_symbol),
  INDEX idx_crypto_opportunities_opportunity_type (opportunity_type),
  INDEX idx_crypto_opportunities_risk_level (risk_level),
  INDEX idx_crypto_opportunities_confidence_score (confidence_score),
  INDEX idx_crypto_opportunities_status (status),
  INDEX idx_crypto_opportunities_source (source),
  INDEX idx_crypto_opportunities_published_at (published_at),
  INDEX idx_crypto_opportunities_deadline (deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Research opportunities/events only; not investment advice or a decision layer.';

CREATE TABLE crypto_onchain_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(32) DEFAULT NULL,
  chain VARCHAR(80) DEFAULT NULL,
  contract_address VARCHAR(160) DEFAULT NULL,
  metric_date DATE NOT NULL,
  active_addresses BIGINT UNSIGNED DEFAULT NULL,
  transaction_count BIGINT UNSIGNED DEFAULT NULL,
  tvl_usd DECIMAL(28, 8) DEFAULT NULL,
  volume_24h_usd DECIMAL(28, 8) DEFAULT NULL,
  whale_transactions BIGINT UNSIGNED DEFAULT NULL,
  exchange_inflow DECIMAL(28, 8) DEFAULT NULL,
  exchange_outflow DECIMAL(28, 8) DEFAULT NULL,
  net_flow DECIMAL(28, 8) DEFAULT NULL,
  source VARCHAR(120) NOT NULL,
  source_id VARCHAR(190) DEFAULT NULL,
  hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_crypto_onchain_metrics_symbol_chain_date_source (symbol, chain, metric_date, source),
  UNIQUE KEY uq_crypto_onchain_metrics_contract_date_source (contract_address, metric_date, source),
  INDEX idx_crypto_onchain_metrics_symbol (symbol),
  INDEX idx_crypto_onchain_metrics_chain (chain),
  INDEX idx_crypto_onchain_metrics_contract_address (contract_address),
  INDEX idx_crypto_onchain_metrics_metric_date (metric_date),
  INDEX idx_crypto_onchain_metrics_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='On-chain metric snapshots. Missing on-chain data must trigger manual verification, not a positive assessment.';

CREATE TABLE crypto_market_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  summary_date DATE NOT NULL,
  timeframe ENUM('daily', 'weekly', 'monthly', 'ad_hoc') NOT NULL DEFAULT 'daily',
  market_sentiment VARCHAR(120) DEFAULT NULL,
  fear_greed_index SMALLINT UNSIGNED DEFAULT NULL,
  btc_dominance DECIMAL(6, 3) DEFAULT NULL,
  total_market_cap_usd DECIMAL(28, 8) DEFAULT NULL,
  defi_tvl_usd DECIMAL(28, 8) DEFAULT NULL,
  top_gainers JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  top_losers JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  trending_narratives JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  research_summary TEXT,
  source_breakdown JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  ai_analysis JSON COMMENT 'Optional future narrative/research layer only; not a decision layer.',
  hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_crypto_market_summaries_summary_date_timeframe (summary_date, timeframe),
  INDEX idx_crypto_market_summaries_summary_date (summary_date),
  INDEX idx_crypto_market_summaries_timeframe (timeframe),
  INDEX idx_crypto_market_summaries_market_sentiment (market_sentiment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Daily/weekly market context and research summaries for the Crypto Market module.';

CREATE TABLE crypto_source_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id VARCHAR(120) NOT NULL,
  source_name VARCHAR(255) DEFAULT NULL,
  source_tier ENUM('free', 'freemium', 'paid', 'internal') NOT NULL DEFAULT 'free',
  run_type VARCHAR(120) NOT NULL,
  status ENUM('success', 'warning', 'error', 'disabled') NOT NULL DEFAULT 'disabled',
  started_at TIMESTAMP NULL DEFAULT NULL,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  records_seen INT UNSIGNED DEFAULT 0,
  records_inserted INT UNSIGNED DEFAULT 0,
  records_updated INT UNSIGNED DEFAULT 0,
  error_message TEXT,
  rate_limit_remaining INT DEFAULT NULL,
  config_enabled BOOLEAN DEFAULT FALSE,
  env_configured BOOLEAN DEFAULT FALSE,
  metadata JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_crypto_source_runs_source_id (source_id),
  INDEX idx_crypto_source_runs_source_tier (source_tier),
  INDEX idx_crypto_source_runs_status (status),
  INDEX idx_crypto_source_runs_started_at (started_at),
  INDEX idx_crypto_source_runs_finished_at (finished_at),
  INDEX idx_crypto_source_runs_config_enabled (config_enabled),
  INDEX idx_crypto_source_runs_env_configured (env_configured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Cron/data collection observability. Disabled paid vendors should log disabled metadata and not crash.';

-- Candidate table - open decision, intentionally not active SQL.
-- OPEN DECISION: do not include in production migration until AI KINTEL ownership/user scope is confirmed.
-- Purpose: production-local analyst review notes if AI KINTEL decides to store them.
-- Caution: ownership is unresolved: user-specific vs shared/internal vs no production storage.
--
-- CREATE TABLE crypto_analyst_reviews (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   project_symbol VARCHAR(32) DEFAULT NULL,
--   project_name VARCHAR(255) DEFAULT NULL,
--   contract_address VARCHAR(160) DEFAULT NULL,
--   chain VARCHAR(80) DEFAULT NULL,
--   review_status VARCHAR(120) NOT NULL DEFAULT 'not_reviewed',
--   review_note TEXT,
--   next_review_step TEXT,
--   analyst_context JSON COMMENT 'MariaDB may store JSON as validated text depending on version.',
--   reviewer_scope VARCHAR(120) DEFAULT NULL COMMENT 'Open decision: user-specific, shared internal, or disabled.',
--   hash VARCHAR(64) UNIQUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   INDEX idx_crypto_analyst_reviews_project_symbol (project_symbol),
--   INDEX idx_crypto_analyst_reviews_contract_address (contract_address),
--   INDEX idx_crypto_analyst_reviews_chain (chain),
--   INDEX idx_crypto_analyst_reviews_review_status (review_status)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
-- COMMENT='Candidate table only. Analyst review storage remains an AI KINTEL ownership/scope decision.';
