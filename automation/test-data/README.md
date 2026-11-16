# test-data/

Environment-aware test data (skill: test-data-management). `TEST_ENV` in `.env` selects the folder.

```
test-data/
├── web/<env>/      users.json, products.json …   -> dataFor('web', 'users.json', 'validUser')
├── mobile/<env>/                                  -> dataFor('mobile', …)
├── api/<env>/                                     -> Karate: * def users = readData('users.json')
└── <platform>/common/                             optional fallback shared by all environments
```

- Store records under **meaningful keys** (`validUser`, `expiredCard`), never as raw values in features, steps or page objects.
- Records that tests create use unique values at runtime: `uniqueId()` / `uniqueEmail(domain)` (TS) or `uniqueId('user')` (Karate).
- **No real customer data or real credentials.** Passwords and tokens belong in `.env` (skill: secrets-and-env-handling). Data files reference them by
  variable name if needed.
- Missing data → the scenario is **BLOCKED** with the file/key named. Ask the user. Never invent data.
- API JSON schemas stay in `api/test-data/schemas/` (not environment-specific).
