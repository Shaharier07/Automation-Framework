@ignore
Feature: Reusable authentication
  Builds the Authorization headers for the configured auth type.
  Called once per run from karate-config.js via karate.callSingle; result: authHeaders.
  Input: auth = { type, token, username, password, apiKey, apiKeyHeader, tokenUrl, clientId, clientSecret, scope }

  Scenario: Resolve auth headers
    * def type = auth.type
    * def require = function(field){ if (!auth[field]) karate.fail('API_AUTH_TYPE=' + type + ' requires ' + field + ' (see .env.example)') }
    * def authHeaders = {}

    # --- Bearer token ---
    * if (type == 'bearer') require('token')
    * if (type == 'bearer') authHeaders = { Authorization: '#("Bearer " + auth.token)' }

    # --- Basic auth ---
    * def Base64 = Java.type('java.util.Base64')
    * def encodeBasic = function(){ return Base64.getEncoder().encodeToString((auth.username + ':' + auth.password).getBytes('UTF-8')) }
    * if (type == 'basic') require('username')
    * if (type == 'basic') authHeaders = { Authorization: '#("Basic " + encodeBasic())' }

    # --- API key ---
    * if (type == 'apikey') require('apiKey')
    * if (type == 'apikey') authHeaders[auth.apiKeyHeader] = auth.apiKey

    # --- OAuth2 client credentials ---
    * if (type == 'oauth2') require('tokenUrl')
    * def oauth = type == 'oauth2' ? karate.call('classpath:common/oauth2-token.feature', { auth: auth }) : null
    * if (type == 'oauth2') authHeaders = { Authorization: '#("Bearer " + oauth.accessToken)' }

    * if (['none','bearer','basic','apikey','oauth2'].indexOf(type) < 0) karate.fail('Unknown API_AUTH_TYPE: ' + type)
