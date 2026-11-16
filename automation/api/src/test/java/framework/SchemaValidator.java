package framework;

import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * JSON Schema validation for Karate (draft 2020-12 by default; honours "$schema" if present).
 *
 * In a feature:
 *   * match validateSchema('test-data/schemas/user.schema.json', response) == []
 */
public final class SchemaValidator {

    private static final SchemaRegistry REGISTRY = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Map<String, Schema> CACHE = new ConcurrentHashMap<>();

    private SchemaValidator() {}

    /** @return list of human-readable violations; empty when the JSON is valid. */
    public static List<String> validate(String classpathSchema, String json) {
        Schema schema = CACHE.computeIfAbsent(classpathSchema, SchemaValidator::load);
        List<Error> errors = schema.validate(json, InputFormat.JSON);
        return errors.stream().map(e -> e.getInstanceLocation() + ": " + e.getMessage()).collect(Collectors.toList());
    }

    private static Schema load(String classpathSchema) {
        String path = classpathSchema.replaceFirst("^classpath:", "");
        try (InputStream in = SchemaValidator.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IllegalArgumentException("Schema not found on classpath: " + path);
            return REGISTRY.getSchema(new String(in.readAllBytes(), StandardCharsets.UTF_8), InputFormat.JSON);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read schema " + path, e);
        }
    }
}
