package framework;

import com.intuit.karate.http.HttpLogModifier;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Masks secrets in Karate HTTP logs and Allure attachments (skill: secrets-and-env-handling).
 *  - headers: Authorization, Cookie/Set-Cookie, *token*, *api-key*, *secret*, *password*
 *  - JSON / form bodies and query strings: values of keys like password, token, secret, apiKey, client_secret
 */
public final class SecretMasker implements HttpLogModifier {

    public static final SecretMasker INSTANCE = new SecretMasker();
    private static final String MASK = "***";

    private static final Pattern SENSITIVE_NAME = Pattern.compile(
            "(?i)(authorization|cookie|token|api[-_]?key|apikey|secret|password|passwd|pwd|credential|session)");
    // "password": "x"  |  "access_token":"x"
    private static final Pattern JSON_FIELD = Pattern.compile(
            "(?i)(\"[^\"]*(?:password|passwd|pwd|token|secret|api[-_]?key|apikey|credential)[^\"]*\"\\s*:\\s*)\"(?:[^\"\\\\]|\\\\.)*\"");
    // password=x&...  (form bodies, query strings)
    private static final Pattern FORM_FIELD = Pattern.compile(
            "(?i)((?:^|[?&])[^=&\\s]*(?:password|passwd|pwd|token|secret|api[-_]?key|apikey)[^=&\\s]*=)[^&\\s]*");

    private SecretMasker() {}

    public static String maskHeader(String name, String value) {
        return name != null && SENSITIVE_NAME.matcher(name).find() ? MASK : value;
    }

    public static String maskBody(String body) {
        if (body == null || body.isEmpty()) return body;
        String out = JSON_FIELD.matcher(body).replaceAll(m -> Matcher.quoteReplacement(m.group(1) + "\"" + MASK + "\""));
        return FORM_FIELD.matcher(out).replaceAll(m -> Matcher.quoteReplacement(m.group(1) + MASK));
    }

    @Override public boolean enableForUri(String uri) { return true; }
    @Override public String uri(String uri) { return maskBody(uri); }
    @Override public String header(String header, String value) { return maskHeader(header, value); }
    @Override public String request(String uri, String request) { return maskBody(request); }
    @Override public String response(String uri, String response) { return maskBody(response); }
}
