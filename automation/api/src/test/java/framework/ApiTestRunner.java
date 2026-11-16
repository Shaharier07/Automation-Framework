package framework;

import com.intuit.karate.Results;
import com.intuit.karate.Runner;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Single entry point for all Karate API scenarios (features/api/**).
 *
 * System properties (set by `npm run test:api` or `mvn test -D...`):
 *   karate.env      dev | qa | staging | prod ...   (selects API_BASE_URL_<ENV>)
 *   karate.tags     Karate tag expression, e.g. "@smoke" or "@smoke,@regression" (OR);
 *                   separate AND groups with ';'  e.g. "@smoke;~@wip"
 *   karate.threads  parallel threads (default 1)
 */
class ApiTestRunner {

    @Test
    void runApiTests() {
        String tagProp = System.getProperty("karate.tags", "").trim();
        int threads = Integer.getInteger("karate.threads", 1);

        Runner.Builder<?> builder = Runner.path("classpath:api-tests")
                .hook(new AllureKarateHook())
                .outputCucumberJson(true)
                .outputJunitXml(true)
                .reportDir(System.getProperty("karate.report.dir", "../reports/karate"))
                .backupReportDir(false);

        if (!tagProp.isEmpty()) {
            builder.tags(Arrays.stream(tagProp.split(";")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new));
        }

        Results results = builder.parallel(threads);
        assertEquals(0, results.getFailCount(), results.getErrorMessages());
    }
}
