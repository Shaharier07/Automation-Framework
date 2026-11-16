package framework;

import com.intuit.karate.RuntimeHook;
import com.intuit.karate.core.Embed;
import com.intuit.karate.core.Scenario;
import com.intuit.karate.core.ScenarioResult;
import com.intuit.karate.core.ScenarioRuntime;
import com.intuit.karate.core.Step;
import com.intuit.karate.core.StepResult;
import com.intuit.karate.http.HttpRequest;
import com.intuit.karate.http.Response;
import io.qameta.allure.Allure;
import io.qameta.allure.AllureLifecycle;
import io.qameta.allure.model.Label;
import io.qameta.allure.model.Status;
import io.qameta.allure.model.StatusDetails;
import io.qameta.allure.model.TestResult;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Writes Karate scenarios to Allure (reports/allure-results/api) with:
 *  - tags as Allure tags; @id=XYZ or @TC-XYZ (prefixes from -Dtc.id.prefixes, default TC) -> label testCaseId
 *  - priority tags @critical/@high/@medium/@low -> severity; @epic=/@story=/@owner= labels
 *  - every Gherkin step as an Allure step
 *  - HTTP request + response attached to each "method ..." step
 *  - assertion failures = FAILED, unexpected errors = BROKEN
 * Steps of called features (call read(...)) are summarised by the calling step.
 */
public class AllureKarateHook implements RuntimeHook {

    private static final Pattern ASSERTION = Pattern.compile(
            "(match failed|status code was|did not evaluate to 'true'|assert|expected)", Pattern.CASE_INSENSITIVE);
    private static final Map<String, String> LABEL_TAGS = Map.of(
            "id", "testCaseId", "epic", "epic", "story", "story", "owner", "owner");
    /** Priority tag (skill: tagging-and-suites) -> Allure severity. */
    private static final Map<String, String> PRIORITY_SEVERITY = Map.of(
            "critical", "blocker", "high", "critical", "medium", "normal", "low", "minor");

    /** Mirrors config/traceability.config.ts: a tag that IS the ID, e.g. @TC-WEB-012. */
    private static final Pattern PREFIX_ID = Pattern.compile(
            "^((?:" + String.join("|", java.util.Arrays.stream(System.getProperty("tc.id.prefixes", "TC").split(","))
                    .map(String::trim).filter(p -> !p.isEmpty()).map(Pattern::quote).toList()) + ")[-_]\\S+)$",
            Pattern.CASE_INSENSITIVE);

    private final AllureLifecycle lifecycle = Allure.getLifecycle();
    private final Map<ScenarioRuntime, String> testUuids = new ConcurrentHashMap<>();
    private final Map<ScenarioRuntime, String> stepUuids = new ConcurrentHashMap<>();

    private static boolean nested(ScenarioRuntime sr) {
        return sr.caller != null && sr.caller.depth > 0;
    }

    @Override
    public boolean beforeScenario(ScenarioRuntime sr) {
        if (nested(sr)) return true;
        Scenario sc = sr.scenario;
        String uuid = UUID.randomUUID().toString();
        String featurePath = sc.getFeature().getResource().getRelativePath();
        String name = sc.getName() == null || sc.getName().isBlank() ? "Scenario line " + sc.getLine() : sc.getName();
        if (sc.isOutlineExample()) name = name + " [example " + (sc.getExampleIndex() + 1) + "]";

        List<Label> labels = new ArrayList<>();
        String feature = sc.getFeature().getName() == null ? featurePath : sc.getFeature().getName();
        labels.add(label("feature", feature));
        labels.add(label("suite", "API"));
        labels.add(label("subSuite", feature));
        labels.add(label("framework", "karate"));
        labels.add(label("language", "gherkin"));
        labels.add(label("thread", Thread.currentThread().getName()));
        for (String tag : sc.getTagsEffective().getTags()) {
            labels.add(label("tag", "@" + tag));
            if (PREFIX_ID.matcher(tag).matches()) labels.add(label("testCaseId", tag.replaceFirst("-[a-z]$", "")));
            String sev = PRIORITY_SEVERITY.get(tag.toLowerCase());
            if (sev != null && labels.stream().noneMatch(l -> "severity".equals(l.getName()))) labels.add(label("severity", sev));
            int eq = tag.indexOf('=');
            if (eq > 0) {
                String target = LABEL_TAGS.get(tag.substring(0, eq).toLowerCase());
                if (target != null) {
                    for (String v : tag.substring(eq + 1).split(",")) {
                        labels.add(label(target, "testCaseId".equals(target) ? v.trim().replaceFirst("-[a-z]$", "") : v.trim()));
                    }
                }
            }
        }

        TestResult result = new TestResult()
                .setUuid(uuid)
                .setName(name)
                .setFullName(featurePath + ":" + sc.getLine())
                .setHistoryId(md5(featurePath + "#" + name))
                .setTestCaseId(md5(featurePath + "#" + name))
                .setDescription(sc.getDescription())
                .setLabels(labels);
        lifecycle.scheduleTestCase(result);
        lifecycle.startTestCase(uuid);
        testUuids.put(sr, uuid);
        return true;
    }

    @Override
    public boolean beforeStep(Step step, ScenarioRuntime sr) {
        if (nested(sr) || !testUuids.containsKey(sr)) return true;
        String stepUuid = UUID.randomUUID().toString();
        lifecycle.startStep(testUuids.get(sr), stepUuid,
                new io.qameta.allure.model.StepResult().setName(step.getPrefix() + " " + step.getText()));
        stepUuids.put(sr, stepUuid);
        return true;
    }

    @Override
    public void afterStep(StepResult sr0, ScenarioRuntime sr) {
        String stepUuid = stepUuids.remove(sr);
        if (nested(sr) || stepUuid == null) return;

        if (sr0.getStep().getText().trim().startsWith("method ")) attachHttp(sr);
        if (sr0.getEmbeds() != null) {
            for (Embed e : sr0.getEmbeds()) {
                lifecycle.addAttachment(e.getFile().getName(), e.getResourceType().contentType,
                        e.getResourceType().getExtension(), e.getBytes());
            }
        }

        Status status = status(sr0.getResult().getStatus(), sr0.getErrorMessage(), sr0.getResult().getError());
        StatusDetails details = sr0.isFailed() ? new StatusDetails().setMessage(sr0.getErrorMessage()) : null;
        lifecycle.updateStep(stepUuid, s -> s.setStatus(status).setStatusDetails(details));
        lifecycle.stopStep(stepUuid);
    }

    @Override
    public void afterScenario(ScenarioRuntime sr) {
        String uuid = testUuids.remove(sr);
        if (nested(sr) || uuid == null) return;
        ScenarioResult res = sr.result;
        Status status = res.isFailed()
                ? status("failed", res.getErrorMessage(), res.getError())
                : Status.PASSED;
        StatusDetails details = res.isFailed()
                ? new StatusDetails().setMessage(res.getErrorMessage()).setTrace(trace(res.getError()))
                : null;
        lifecycle.updateTestCase(uuid, t -> t.setStatus(status).setStatusDetails(details));
        lifecycle.stopTestCase(uuid);
        lifecycle.writeTestCase(uuid);
    }

    /* ----------------------------------------------------------------- */

    private void attachHttp(ScenarioRuntime sr) {
        try {
            HttpRequest req = sr.engine.getHttpRequest();
            if (req != null) {
                StringBuilder b = new StringBuilder(req.getMethod()).append(' ').append(SecretMasker.maskBody(req.getUrl())).append("\n\n");
                if (req.getHeaders() != null) req.getHeaders().forEach((k, v) -> b.append(k).append(": ").append(SecretMasker.maskHeader(k, String.join(", ", v))).append('\n'));
                String body = req.getBodyForDisplay();
                if ((body == null || body.isBlank()) && req.getBody() != null) body = new String(req.getBody(), StandardCharsets.UTF_8);
                if (body != null && !body.isBlank()) b.append('\n').append(SecretMasker.maskBody(body));
                lifecycle.addAttachment("HTTP Request", "text/plain", "txt", b.toString().getBytes(StandardCharsets.UTF_8));
            }
            Response res = sr.engine.getResponse();
            if (res != null) {
                StringBuilder b = new StringBuilder("Status: ").append(res.getStatus())
                        .append("   Time: ").append(sr.engine.vars.containsKey("responseTime") ? sr.engine.vars.get("responseTime").getAsString() + " ms" : "n/a").append("\n\n");
                if (res.getHeaders() != null) res.getHeaders().forEach((k, v) -> b.append(k).append(": ").append(SecretMasker.maskHeader(k, String.join(", ", v))).append('\n'));
                String body = res.getBodyAsString();
                if (body != null && !body.isBlank()) b.append('\n').append(SecretMasker.maskBody(body));
                lifecycle.addAttachment("HTTP Response", "text/plain", "txt", b.toString().getBytes(StandardCharsets.UTF_8));
            }
        } catch (RuntimeException ignored) {
            // never let reporting break a test
        }
    }

    private static Status status(String karateStatus, String message, Throwable error) {
        if ("passed".equals(karateStatus)) return Status.PASSED;
        if ("skipped".equals(karateStatus)) return Status.SKIPPED;
        if (error instanceof AssertionError) return Status.FAILED;
        return message != null && ASSERTION.matcher(message).find() ? Status.FAILED : Status.BROKEN;
    }

    private static String trace(Throwable t) {
        if (t == null) return null;
        StringBuilder b = new StringBuilder(t.toString());
        for (StackTraceElement e : t.getStackTrace()) b.append("\n\tat ").append(e);
        return b.toString();
    }

    private static Label label(String name, String value) {
        return new Label().setName(name).setValue(value);
    }

    private static String md5(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
