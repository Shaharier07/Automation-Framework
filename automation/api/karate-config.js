/**
 * Karate global configuration — runs before every API scenario.
 *
 * Environment: karate.env = TEST_ENV (set by `npm run test:api`, override with `-- --env <name>`).
 * Every value is read from environment variables (loaded from automation/.env by the runner):
 *   <NAME>_<ENV>  takes precedence over  <NAME>      e.g. API_BASE_URL_QA  >  API_BASE_URL
 * Nothing is hard-coded: URLs, credentials and keys must come from .env / CI secrets.
 * Skills: secrets-and-env-handling, api-validation-rules, test-data-management.
 */
function fn() {
  var env = (karate.env || 'local').toLowerCase();
  var System = Java.type('java.lang.System');

  function setting(name, fallback) {
    var v = System.getenv(name + '_' + env.toUpperCase()) || System.getenv(name);
    return (v === null || v === undefined || v === '') ? (fallback === undefined ? '' : fallback) : String(v);
  }

  // fail fast, naming the variable (never guess an environment value)
  function required(name, purpose) {
    var v = setting(name);
    if (!v) karate.fail('BLOCKED: Missing required variable ' + name + ' (or ' + name + '_' + env.toUpperCase() + ') in .env — needed for ' + purpose + '. Ask the user for the value; see .env.example.');
    return v;
  }

  var config = {
    env: env,
    baseUrl: required('API_BASE_URL', 'API tests (base URL of the API)'),
    // api-validation-rules: every test asserts  responseTime < maxResponseTime
    maxResponseTime: parseInt(setting('API_MAX_RESPONSE_MS', '3000')),
    auth: {
      type: setting('API_AUTH_TYPE', 'none').toLowerCase(),  // none | bearer | basic | apikey | oauth2
      token: setting('API_TOKEN'),
      username: setting('API_USERNAME'),
      password: setting('API_PASSWORD'),
      apiKey: setting('API_KEY'),
      apiKeyHeader: setting('API_KEY_HEADER', 'x-api-key'),
      tokenUrl: setting('API_OAUTH_TOKEN_URL'),
      clientId: setting('API_OAUTH_CLIENT_ID'),
      clientSecret: setting('API_OAUTH_CLIENT_SECRET'),
      scope: setting('API_OAUTH_SCOPE')
    }
  };

  // ---- timeouts & logging ----
  var timeout = parseInt(setting('API_TIMEOUT_MS', '30000'));
  karate.configure('connectTimeout', timeout);
  karate.configure('readTimeout', timeout);
  karate.configure('logPrettyRequest', true);
  karate.configure('logPrettyResponse', true);
  // never log secrets (headers, JSON/form fields, query params)
  karate.configure('logModifier', Java.type('framework.SecretMasker').INSTANCE);
  if (setting('API_SSL_TRUST_ALL', 'false') === 'true') karate.configure('ssl', true);

  // ---- reusable authentication (resolved once per run, cached across features) ----
  config.authHeaders = config.auth.type === 'none'
    ? {}
    : karate.callSingle('classpath:common/auth.feature', { auth: config.auth }).authHeaders;

  // ---- default headers for every request (override per feature with: * configure headers = {...}) ----
  config.defaultHeaders = karate.merge({ Accept: 'application/json' }, config.authHeaders);
  karate.configure('headers', config.defaultHeaders);

  // ---- helpers available in every feature ----
  // environment test data: test-data/api/<env>/<file>  ->  * def users = readData('users.json')
  config.readData = function (file) {
    try { return karate.read('classpath:test-data/' + env + '/' + file); }
    catch (e) { karate.fail('BLOCKED: test data test-data/api/' + env + '/' + file + ' not found. Ask the user for the data.'); }
  };
  // unique values for records the test creates:  * def email = uniqueId('user') + '@' + emailDomain
  config.uniqueId = function (prefix) {
    return (prefix || 'auto') + '_' + java.lang.System.currentTimeMillis() + '_' + Math.floor(Math.random() * 100000);
  };
  var SchemaValidator = Java.type('framework.SchemaValidator');
  config.validateSchema = function (schemaPath, json) {
    return SchemaValidator.validate(schemaPath, typeof json === 'string' ? json : JSON.stringify(json));
  };

  karate.log('karate.env =', env, '| baseUrl =', config.baseUrl || '(not set)', '| auth =', config.auth.type);
  return config;
}
