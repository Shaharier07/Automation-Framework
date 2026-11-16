# api/features/common — reusable Karate building blocks

Not executed directly (tagged `@ignore`). Call them from API scenarios in `features/api/`.

| File | Purpose |
|---|---|
| `auth.feature` | Builds auth headers for `API_AUTH_TYPE` (none/bearer/basic/apikey/oauth2). Called once per run by `karate-config.js`. |
| `oauth2-token.feature` | Client-credentials token request used by `auth.feature`. |

Add more shared flows here (e.g. create-user setup, cleanup) and call them with
`* call read('classpath:common/<file>.feature') { ... }`.
