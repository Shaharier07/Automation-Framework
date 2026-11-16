@ignore
Feature: OAuth2 client-credentials token (called by auth.feature)

  Scenario: Fetch access token
    * def fields = { grant_type: 'client_credentials', client_id: '#(auth.clientId)', client_secret: '#(auth.clientSecret)' }
    * if (auth.scope) fields.scope = auth.scope
    Given url auth.tokenUrl
    And form fields fields
    When method post
    Then status 200
    And match response.access_token == '#string'
    * def accessToken = response.access_token
