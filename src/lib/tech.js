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
    Cassandra: ['cassandra', 'apache cassandra'],
    ScyllaDB: ['scylladb', 'scylla'],
    Firestore: ['firestore'],
  },
  queue: {
    SQS: ['sqs', 'simple queue service'],
    Kafka: ['kafka', 'msk', 'managed streaming', 'confluent', 'redpanda', '카프카'],
    RabbitMQ: ['rabbitmq', 'amqp'],
    Kinesis: ['kinesis'],
    'Pub/Sub': ['pub/sub', 'pubsub'],
    NATS: ['nats'],
    Pulsar: ['pulsar', 'apache pulsar'],
    EventBridge: ['eventbridge', 'event bridge'],
    SNS: ['sns topic', 'sns topics', 'amazon sns', 'aws sns'],
  },
  'api style': {
    REST: ['rest api', 'openapi', 'restful', 'is rest'],
    GraphQL: ['graphql', 'apollo', 'graph ql', 'hasura'],
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
    'own login': ['own login', 'argon2', 'username and password', 'password form', 'credentials table', 'password login', 'password hash', 'bcrypt', 'login page', 'password reset ourselves', 'store passwords', 'build login', '비밀번호 해시', '로그인 기능 직접', '직접 만듭', '직접 구현'],
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
    Mandrill: ['mandrill', 'mailchimp transactional'],
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
    'manual console changes': ['aws console', 'aws ui', 'aws 콘솔', '콘솔에서 직접', 'by hand in the console', 'click-ops', 'clickops', 'in the console', 'from the console', 'console now', 'manually in console'],
  },
  mobile: {
    'React Native': ['react native', 'expo'],
    Flutter: ['flutter', 'dart'],
    'native apps': ['native ios', 'native android', 'swiftui', 'uikit', 'jetpack compose', 'separate native', 'rebuilt natively', 'built natively'],
  },
  'backend language': {
    Python: ['python', 'fastapi', 'django', 'flask'],
    Go: ['golang', 'in go', 'go service', 'go binary'],
    'Node.js': ['node.js', 'nodejs', 'express.js', 'nestjs', 'fastify', 'deno'],
    Java: ['java', 'spring boot'],
    Rust: ['rust'],
    Kotlin: ['kotlin', 'ktor'],
    'C#': ['c#', '.net', 'dotnet'],
    'C/C++': ['c++', 'cpp', 'in c', 'c code', 'c module', 'c file', 'c로'],
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
  'background jobs': {
    Temporal: ['temporal', 'temporal workflow', 'temporal cloud'],
    Celery: ['celery', 'celery beat'],
    BullMQ: ['bullmq', 'bull queue'],
    Sidekiq: ['sidekiq'],
    Airflow: ['airflow'],
    cron: ['crontab', 'cron job', 'cronjob', 'kubernetes cronjob', 'k8s cronjob', '크론탭', '크론'],
  },
  search: {
    Algolia: ['algolia'],
    Elasticsearch: ['elasticsearch', 'elastic cloud'],
    OpenSearch: ['opensearch', 'amazon opensearch'],
    Typesense: ['typesense'],
    Meilisearch: ['meilisearch'],
  },
  payments: {
    Stripe: ['stripe'],
    Adyen: ['adyen'],
    Braintree: ['braintree'],
    PayPal: ['paypal'],
    'Toss Payments': ['toss payments', '토스페이먼츠'],
  },
  'object storage': {
    S3: ['s3', 'amazon s3', 's3 bucket'],
    GCS: ['google cloud storage', 'gcs'],
    'Azure Blob': ['azure blob'],
    Cloudinary: ['cloudinary'],
  },
  cdn: {
    CloudFront: ['cloudfront'],
    Fastly: ['fastly'],
    Cloudflare: ['cloudflare'],
    Akamai: ['akamai'],
  },
  maps: {
    HERE: ['here platform', 'here geocoding', 'here api', 'here maps'],
    'Google Maps': ['google maps', 'google geocoding', 'google places', 'google directions', 'google routes'],
    Mapbox: ['mapbox'],
    OSRM: ['osrm', 'nominatim'],
  },
  'device messaging': {
    MQTT: ['mqtt', 'iot core'],
    WebSocket: ['websocket', 'websockets', 'raw websocket'],
    CoAP: ['coap'],
  },
  'push notifications': {
    'Firebase Cloud Messaging': ['firebase cloud messaging', 'fcm'],
    Airship: ['airship'],
    OneSignal: ['onesignal'],
    'SNS mobile push': ['sns mobile push', 'amazon sns push'],
    APNs: ['apns'],
  },
  'money format': {
    'integer minor units': ['minor units', 'integer cents', 'in cents', 'bigint cents', '정수 센트'],
    'floating point': ['floating point', 'floating-point', 'float column', 'float columns', 'floats', 'double precision', 'as a double', 'double column', '부동소수점'],
    'decimal strings': ['decimal string', 'decimal strings', '소수점 문자열'],
    'decimal numbers': ['numeric(', 'decimal(', 'in dollars'],
  },
  'time storage': {
    UTC: ['utc', 'timestamptz'],
    'local time': ['naive datetime', 'timestamp without time zone', 'without timezone', 'without time zone', 'as local time', 'in local time', 'offset column', 'offset columns', 'kst 그대로', "user's own timezone", "user's timezone"],
  },
  architecture: {
    monolith: ['monolith', 'inside the existing ledger service', 'existing ledger service'],
    microservice: ['microservice', 'standalone lambda', 'its own repo', 'own repo', 'separate repo', 'separate deployable', '별도 서비스', '독립 서비스', '독립적으로 배포', 'separate service', 'standalone service', 'its own service', 'own deploy pipeline', 'deployed separately'],
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
    // Korean attaches particles to the word ("소수점 문자열로"), so Hangul aliases need no right boundary.
    // Latin aliases may also be followed by a Korean particle ("Kafka를", "Redux로").
    const right = /[가-힣]$/.test(a) ? '' : '(?=$|[^\\p{L}\\p{N}_]|[가-힣])';
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(a)}${right}`, 'u');
    const m = re.exec(hay);
    if (m && !seen.has(name)) seen.set(name, { category, name, alias: a, index: m.index });
  }
  return [...seen.values()];
}

/** Map a free-text rejected option ("MongoDB or any other document database") to known techs. */
export function techsIn(text = '') {
  return mentionedTechs(text).map((t) => t.name);
}
