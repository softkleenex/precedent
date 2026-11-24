// A small, explainable knowledge base of technology categories.
// If a decision chooses one member of a category (e.g. SQS for queues), work that
// adopts a *different* member of the same category (e.g. Amazon MSK) is flagged.
// Aliases map paraphrases to the same technology (MSK and Confluent are Kafka).

export const CATEGORIES = {
  database: {
    PostgreSQL: ['postgresql', 'postgres', 'rds postgres', 'aurora postgres'],
    MySQL: ['mysql', 'mariadb', 'aurora mysql'],
    MongoDB: ['mongodb', 'mongo', 'documentdb', 'document database', 'document db', 'document store', '몽고db'],
    Couchbase: ['couchbase'],
    DynamoDB: ['dynamodb', 'dynamo'],
    Cassandra: ['cassandra', 'scylla'],
    Firestore: ['firestore'],
  },
  queue: {
    SQS: ['sqs', 'simple queue service'],
    Kafka: ['kafka', 'msk', 'managed streaming', 'confluent', 'redpanda', '카프카'],
    RabbitMQ: ['rabbitmq', 'amqp'],
    Kinesis: ['kinesis'],
    'Pub/Sub': ['pub/sub', 'pubsub'],
    NATS: ['nats'],
  },
  'api style': {
    REST: ['rest api', 'openapi', 'restful', 'is rest'],
    GraphQL: ['graphql', 'apollo', 'graph ql'],
    gRPC: ['grpc'],
    SOAP: ['soap'],
  },
  authentication: {
    Auth0: ['auth0'],
    'Firebase Auth': ['firebase auth', 'firebase authentication'],
    Cognito: ['cognito'],
    Keycloak: ['keycloak'],
    Okta: ['okta'],
    Clerk: ['clerk'],
    'own login': ['own login', 'password hash', 'bcrypt', 'login page', 'password reset ourselves', 'store passwords', 'build login', '비밀번호 해시', '로그인 기능 직접', '직접 만듭', '직접 구현'],
  },
  'frontend state': {
    'TanStack Query': ['tanstack query', 'react query', 'usequery'],
    Redux: ['redux', 'rtk query', 'redux toolkit', 'rtk'],
    MobX: ['mobx'],
    Zustand: ['zustand'],
    SWR: ['swr'],
  },
  observability: {
    OpenTelemetry: ['opentelemetry', 'otel'],
    Grafana: ['grafana'],
    Datadog: ['datadog'],
    'New Relic': ['new relic'],
    Splunk: ['splunk'],
  },
  email: {
    SES: ['ses', 'simple email service'],
    SendGrid: ['sendgrid'],
    Mailgun: ['mailgun'],
    Postmark: ['postmark'],
  },
  ci: {
    'GitHub Actions': ['github actions'],
    Jenkins: ['jenkins'],
    CircleCI: ['circleci'],
    'GitLab CI': ['gitlab ci'],
  },
  infrastructure: {
    Terraform: ['terraform'],
    CDK: ['aws cdk', 'cdk'],
    Pulumi: ['pulumi'],
    'manual console changes': ['aws console', 'in the console', 'from the console', 'console now', 'manually in console'],
  },
  mobile: {
    'React Native': ['react native', 'expo'],
    Flutter: ['flutter', 'dart'],
  },
  'backend language': {
    Python: ['python', 'fastapi', 'django', 'flask'],
    Go: ['golang', 'in go', 'go service', 'go binary'],
    'Node.js': ['node.js', 'nodejs', 'express.js'],
    Java: ['java', 'spring boot'],
    Rust: ['rust'],
  },
  cache: {
    Redis: ['redis', 'elasticache', 'valkey'],
    Memcached: ['memcached'],
  },
  'feature flags': {
    LaunchDarkly: ['launchdarkly'],
    'config flags': ['env var to toggle', 'environment variable flag', 'flag from config', 'enable_'],
    Unleash: ['unleash'],
  },
  architecture: {
    monolith: ['monolith', 'inside the existing ledger service', 'existing ledger service'],
    microservice: ['microservice', 'separate service', 'standalone service', 'its own service', 'own deploy pipeline', 'deployed separately'],
  },
};

const INDEX = [];
for (const [category, techs] of Object.entries(CATEGORIES)) {
  for (const [name, aliases] of Object.entries(techs)) {
    for (const alias of aliases) INDEX.push({ category, name, alias });
  }
}
// Longer aliases first so "rtk query" wins over "rtk".
INDEX.sort((a, b) => b.alias.length - a.alias.length);

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Technologies mentioned in text, with where they occur.
 * Matching is case-insensitive on word boundaries (works inside Korean sentences too).
 */
export function mentionedTechs(text = '') {
  const hay = ` ${text.toLowerCase()} `;
  const seen = new Map();
  for (const { category, name, alias } of INDEX) {
    const a = alias.trim();
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(a)}(?=$|[^\\p{L}\\p{N}_])`, 'u');
    const m = re.exec(hay);
    if (m && !seen.has(name)) seen.set(name, { category, name, alias: a, index: m.index });
  }
  return [...seen.values()];
}

/** Map a free-text rejected option ("MongoDB or any other document database") to known techs. */
export function techsIn(text = '') {
  return mentionedTechs(text).map((t) => t.name);
}
