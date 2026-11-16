---
name: api-validation-rules
description: Use when writing or reviewing Karate API tests. Defines the minimum checks every API test must have. Trigger on "API test", "Karate", "endpoint", "request", "response".
---

# API Validation Rules

## Every API test checks
- Status code (exact, not a range)
- Response schema (types and required fields)
- Key field values relevant to the test
- Important headers (content type, auth-related headers where relevant)
- Response time within the configured threshold

## Coverage per endpoint
- Positive case
- Missing or invalid required fields
- Invalid or missing authentication
- Boundary values
- Not found / wrong ID

## Rules
- Auth and common headers come from reusable setup, never repeated per test.
- Base URLs come from environment config only.
- Request/response details attach to Allure with secrets masked.
- Never assume endpoints or payloads; use only what the user provided.
- Tests that create data clean it up (DELETE) when possible.

## Implementation in this framework
| Check | Karate line |
|---|---|
| status (exact) | `Then status 201` |
| schema | `And match validateSchema('test-data/schemas/<name>.schema.json', response) == []` (JSON Schema in `api/test-data/schemas/`) or fuzzy `match response == { id: '#number', name: '#string' }` |
| key fields | `And match response.email == payload.email` |
| headers | `And match responseHeaders['Content-Type'][0] contains 'application/json'` |
| response time | `And assert responseTime < maxResponseTime` (`API_MAX_RESPONSE_MS`, per environment) |

- **Setup:** `karate-config.js` applies auth (`API_AUTH_TYPE`: bearer/basic/apikey/oauth2, via `classpath:common/auth.feature`) and default headers to every request.
  For negative auth cases, override in that scenario only: `* configure headers = { Accept: 'application/json' }` (no auth), or set an invalid token.
- **Base URL:** `* url baseUrl` (`API_BASE_URL[_<ENV>]`, required; a missing value fails fast as BLOCKED).
- **Data:** `readData('<file>.json')` from `test-data/api/<env>/`, plus `uniqueId()` for created records. Clean up with `DELETE` at the end of the scenario.
- **Allure:** each `method` step gets "HTTP Request" and "HTTP Response" attachments (with the response time). Secrets are masked by `SecretMasker` in Allure and in `reports/logs/karate.log`.
- **Coverage:** one feature per resource or endpoint group, with one scenario per coverage item above that the source test cases ask for. Missing coverage is reported by the test-analyst. It isn't invented.
