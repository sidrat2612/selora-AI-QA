export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

export type MembershipRole =
  | 'PLATFORM_ADMIN'
  | 'TENANT_ADMIN'
  | 'WORKSPACE_OPERATOR'
  | 'WORKSPACE_VIEWER';

export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'REVOKED';

export type MetricType =
  | 'RUN_COUNT'
  | 'EXECUTION_MINUTES'
  | 'ARTIFACT_STORAGE_BYTES'
  | 'CONCURRENT_EXECUTIONS'
  | 'AI_REPAIR_ATTEMPTS'
  | 'API_REQUESTS_PER_MINUTE'
  | 'USER_SEATS'
  | 'WORKSPACE_COUNT';

export type FeedbackCategory =
  | 'BUG'
  | 'UX'
  | 'PERFORMANCE'
  | 'INTEGRATION'
  | 'FEATURE_REQUEST'
  | 'OTHER';

export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FeedbackStatus = 'SUBMITTED' | 'REVIEWED' | 'PLANNED' | 'DEFERRED' | 'CLOSED';

export type SessionMembership = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
};

export type SessionData = {
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
    emailVerifiedAt: string | null;
  };
  memberships: SessionMembership[];
  activeWorkspace: {
    id: string | null;
    name: string | null;
    slug: string | null;
    tenantId: string;
  } | null;
};

export type Workspace = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: string;
  concurrentExecutionLimit: number;
  maxTestsPerRun: number;
  runCooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationSuiteSummary = {
  id: string;
  tenantId: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  isDefault: boolean;
  counts: {
    canonicalTests: number;
    generatedArtifacts: number;
  };
  latestActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationSuiteDetail = AutomationSuiteSummary & {
  linkedSystems: {
    github: null;
    testrail: null;
  };
  canonicalTests: Array<{
    id: string;
    name: string;
    status: TestStatus;
    updatedAt: string;
    latestArtifact: {
      id: string;
      status: GeneratedArtifactStatus;
      version: number;
      createdAt: string;
    } | null;
  }>;
};

export type Membership = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    status: string;
  };
};

export type Environment = {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  secretRef: string;
  isDefault: boolean;
  status: string;
  testTimeoutMs: number;
  runTimeoutMs: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
};

export type RetentionSetting = {
  id: string;
  workspaceId: string;
  logsDays: number;
  screenshotsDays: number;
  videosDays: number;
  tracesDays: number;
  auditDays: number;
  createdAt: string;
  updatedAt: string;
};

export type TenantQuotaMetricSummary = {
  metricType: MetricType;
  label: string;
  unit: string;
  usage: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  threshold: 'normal' | 'warning' | 'critical' | 'exceeded' | 'unlimited';
};

export type TenantQuotaOverview = {
  tenantId: string;
  metrics: TenantQuotaMetricSummary[];
};

export type TenantLifecycleSummary = {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  suspendedAt: string | null;
  archivedAt: string | null;
  softDeleteRequestedAt: string | null;
  softDeleteScheduledFor: string | null;
  counts: {
    workspaces: number;
    activeWorkspaces: number;
    memberSeats: number;
    runs: number;
    recordings: number;
    generatedArtifacts: number;
    auditEvents: number;
  };
  workspaces: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  scopedWorkspaceIds: string[];
};

export type BetaFeedback = {
  id: string;
  tenantId: string;
  workspaceId: string;
  submittedByUserId: string;
  title: string;
  summary: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
  submittedBy: {
    id: string;
    email: string;
    name: string;
  };
};

export type RecordingStatus = 'UPLOADED' | 'PROCESSING' | 'NORMALIZED' | 'FAILED' | 'ARCHIVED';

export type TestStatus =
  | 'INGESTED'
  | 'GENERATED'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'AUTO_REPAIRED'
  | 'NEEDS_HUMAN_REVIEW'
  | 'ARCHIVED';

export type GeneratedArtifactStatus = 'CREATED' | 'VALIDATING' | 'READY' | 'FAILED' | 'ARCHIVED';

export type RepairMode = 'RULE_BASED' | 'LLM_ASSISTED';

export type RepairStatus =
  | 'SUGGESTED'
  | 'APPLIED'
  | 'RERUN_PASSED'
  | 'RERUN_FAILED'
  | 'ABANDONED'
  | 'HUMAN_REVIEW_REQUIRED';

export type RunStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'REPAIRING'
  | 'READY'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'CANCELED'
  | 'TIMED_OUT';

export type ValidationArtifactSummary = {
  id: string;
  artifactType: 'SCREENSHOT' | 'TRACE' | 'VIDEO' | 'LOG' | 'GENERATED_TEST' | 'REPAIR_DIFF';
  fileName: string;
  contentType: string;
  sizeBytes: bigint | number;
  createdAt: string;
};

export type GeneratedTestArtifactSummary = {
  id: string;
  version: number;
  status: GeneratedArtifactStatus;
  createdAt: string;
  fileName?: string;
  storageKey?: string;
  checksum?: string;
  generatorVersion?: string;
  metadataJson?: Record<string, unknown> | null;
  validationStartedAt?: string | null;
  validatedAt?: string | null;
  artifacts?: ValidationArtifactSummary[];
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
};

export type RepairAnalyticsAttemptSummary = {
  id: string;
  attemptNumber: number;
  repairMode: RepairMode;
  status: RepairStatus;
  promptVersion: string;
  modelName: string | null;
  diffSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  canonicalTest: {
    id: string;
    name: string;
    status: TestStatus;
  };
  generatedTestArtifact: {
    id: string;
    version: number;
    fileName: string;
  };
};

export type RepairAnalytics = {
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  appliedFilters: {
    mode: RepairMode | null;
    status: RepairStatus | null;
    page: number;
    pageSize: number;
  };
  totals: {
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
    modesUsed: number;
  };
  byMode: Array<{
    repairMode: RepairMode;
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
  }>;
  byStatus: Array<{
    status: RepairStatus;
    totalAttempts: number;
  }>;
  trends: Array<{
    bucketStart: string;
    interval: 'day' | 'week';
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
  }>;
  attempts: PaginatedResult<RepairAnalyticsAttemptSummary>;
};

export type CanonicalTestSummary = {
  id: string;
  workspaceId: string;
  recordingAssetId: string;
  suiteId: string | null;
  name: string;
  description: string | null;
  tagsJson: string[];
  canonicalVersion: number;
  definitionJson: Record<string, unknown>;
  status: TestStatus;
  createdAt: string;
  updatedAt: string;
  suite: {
    id: string;
    slug: string;
    name: string;
    isDefault: boolean;
  } | null;
  recordingAsset: {
    id: string;
    filename: string;
    version: number;
    status: RecordingStatus;
    createdAt: string;
    metadataJson?: Record<string, unknown> | null;
  };
  generatedArtifacts: GeneratedTestArtifactSummary[];
};

export type CanonicalTestDetail = Omit<CanonicalTestSummary, 'generatedArtifacts'> & {
  generatedArtifacts: Array<GeneratedTestArtifactSummary & { artifacts: ValidationArtifactSummary[] }>;
};

export type GeneratedArtifactDetail = GeneratedTestArtifactSummary & {
  code: string;
  metadataJson: Record<string, unknown> | null;
  validationStartedAt: string | null;
  validatedAt: string | null;
  artifacts: ValidationArtifactSummary[];
};

export type RepairAttemptSummary = {
  id: string;
  attemptNumber: number;
  repairMode: RepairMode;
  status: RepairStatus;
  promptVersion: string;
  modelName: string | null;
  diffSummary: string | null;
  patchStorageKey: string | null;
  patchText: string | null;
  sanitizationMetadataJson: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  generatedTestArtifact: {
    id: string;
    version: number;
    fileName: string;
  };
  patchArtifact: ValidationArtifactSummary | null;
};

export type RecordingSummary = {
  id: string;
  workspaceId: string;
  sourceType: string;
  filename: string;
  originalPath: string | null;
  storageKey: string;
  checksum: string;
  version: number;
  metadataJson: Record<string, unknown> | null;
  status: RecordingStatus;
  uploadedByUserId: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    email: string;
    name: string;
  };
  canonicalTests: Array<{
    id: string;
    name: string;
    status: TestStatus;
    updatedAt: string;
  }>;
};

export type TestRunSummary = {
  id: string;
  tenantId: string;
  workspaceId: string;
  environmentId: string;
  triggeredByUserId: string;
  runType: 'MANUAL';
  status: RunStatus;
  totalCount: number;
  queuedCount: number;
  runningCount: number;
  passedCount: number;
  failedCount: number;
  canceledCount: number;
  timedOutCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  environment: {
    id: string;
    name: string;
    baseUrl: string;
    isDefault: boolean;
  };
  triggeredBy: {
    id: string;
    email: string;
    name: string;
  };
};

export type TestRunItemSummary = {
  id: string;
  testRunId: string;
  canonicalTestId: string;
  generatedTestArtifactId: string;
  sequence: number;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  failureSummary: string | null;
  workerJobId: string | null;
  retryCount: number;
  canonicalTest: {
    id: string;
    name: string;
    status: TestStatus;
  };
  generatedTestArtifact: {
    id: string;
    version: number;
    fileName: string;
    status: GeneratedArtifactStatus;
  };
  artifacts: ValidationArtifactSummary[];
};

export type TestRunComparison = {
  runA: {
    id: string;
    status: RunStatus;
    totalCount: number;
    passedCount: number;
    failedCount: number;
    durationMs: number | null;
    environment: {
      id: string;
      name: string;
      baseUrl: string;
    };
    triggeredBy: {
      id: string;
      email: string;
      name: string;
    };
    createdAt: string;
  };
  runB: {
    id: string;
    status: RunStatus;
    totalCount: number;
    passedCount: number;
    failedCount: number;
    durationMs: number | null;
    environment: {
      id: string;
      name: string;
      baseUrl: string;
    };
    triggeredBy: {
      id: string;
      email: string;
      name: string;
    };
    createdAt: string;
  };
  comparisons: Array<{
    canonicalTestId: string;
    testName: string;
    runA: { status: RunStatus; durationMs: number | null } | null;
    runB: { status: RunStatus; durationMs: number | null } | null;
    changed: boolean;
  }>;
  summary: {
    totalTests: number;
    changedCount: number;
    onlyInA: number;
    onlyInB: number;
  };
};

export type AuditEventSummary = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  actorUserId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    name: string;
  } | null;
};