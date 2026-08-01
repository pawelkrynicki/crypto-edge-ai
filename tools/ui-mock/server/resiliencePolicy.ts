export const RESILIENCE_RETRY_POLICY = {
  central_data_cycle: {
    retryable_errors: ["NETWORK_ERROR", "TIMEOUT", "HTTP_429", "HTTP_5XX", "SOURCE_UNAVAILABLE"],
    fail_closed_errors: ["SCHEMA_INVALID", "CONTRACT_INVALID", "LINEAGE_INVALID", "PROVENANCE_INVALID"],
    maximum_attempts: 3,
    base_backoff_ms: null,
    scheduling: "No in-process retry loop; the existing scheduler cadence supplies later attempts.",
  },
  ai_worker: {
    retryable_errors: ["PROVIDER_TIMEOUT", "PROVIDER_NETWORK_ERROR", "PROVIDER_RATE_LIMITED", "PROVIDER_SERVER_ERROR"],
    fail_closed_errors: ["VALIDATION_FAILURE", "MODEL_MISMATCH", "DATA_STALE", "STORE_SCHEMA_INVALID"],
    maximum_attempts: 3,
    base_backoff_ms: 30_000,
    multiplier: 2,
  },
  explicit_user_writes: {
    retryable_errors: ["FOLLOW_UP_STORE_WRITE_FAILED", "REPORT_WRITE_FAILED", "STORAGE_UNAVAILABLE"],
    fail_closed_errors: ["SCHEMA_INVALID", "IDENTITY_INVALID", "LIFECYCLE_INVALID"],
    maximum_automatic_attempts: 0,
    rule: "A new attempt requires an explicit user or owner action after the failure is visible.",
  },
} as const;

export const RESILIENCE_CIRCUIT_BREAKER_POLICY = {
  opens_when: [
    "one deterministic schema, contract, lineage or validation failure",
    "three consecutive transient central-cycle failures",
    "one non-retryable AI worker contract failure or an exhausted AI retry budget",
  ],
  open_behavior: "No collector/provider execution and no aggressive retry loop; last-known-good remains active.",
  half_open: "Only an authenticated owner resume enables one bounded probe through the normal coordinator or worker.",
  closes_when: "The bounded probe validates and publishes successfully; consecutive failure state resets to zero.",
  ordinary_user_resume: false,
} as const;
