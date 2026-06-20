import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  validateTemplate,
  TemplateTooFewFieldsError,
} from "./templateRenderer.js";

describe("renderTemplate", () => {
  it("replaces all supported fields", () => {
    const result = renderTemplate(
      "Hi {{firstName}} from {{company}}, I saw your role as {{title}}.",
      { firstName: "Alice", company: "Acme Corp", title: "CTO" }
    );
    expect(result).toBe("Hi Alice from Acme Corp, I saw your role as CTO.");
  });

  it("leaves placeholder intact when field is missing", () => {
    const result = renderTemplate("Hi {{firstName}} at {{company}}", {
      firstName: "Bob",
      company: null,
    });
    expect(result).toBe("Hi Bob at {{company}}");
  });

  it("handles all four fields", () => {
    const result = renderTemplate(
      "{{firstName}} {{lastName}} — {{title}} at {{company}}",
      { firstName: "Jane", lastName: "Doe", title: "VP Sales", company: "BigCo" }
    );
    expect(result).toBe("Jane Doe — VP Sales at BigCo");
  });

  it("leaves unknown placeholders untouched", () => {
    const result = renderTemplate("Hello {{firstName}}, {{unknownField}}", {
      firstName: "Sam",
    });
    expect(result).toBe("Hello Sam, {{unknownField}}");
  });

  it("handles repeated fields", () => {
    const result = renderTemplate(
      "{{firstName}}, great to connect! I love what {{company}} is doing.",
      { firstName: "Eve", company: "StartupXYZ" }
    );
    expect(result).toBe(
      "Eve, great to connect! I love what StartupXYZ is doing."
    );
  });
});

describe("validateTemplate", () => {
  it("passes when two distinct known fields are present", () => {
    expect(() =>
      validateTemplate("Hi {{firstName}}, saw you work at {{company}}!")
    ).not.toThrow();
  });

  it("passes with three or more fields", () => {
    expect(() =>
      validateTemplate("Hi {{firstName}} {{lastName}} at {{company}}")
    ).not.toThrow();
  });

  it("throws TemplateTooFewFieldsError with zero dynamic fields", () => {
    expect(() => validateTemplate("Hi there, hope you are well.")).toThrow(
      TemplateTooFewFieldsError
    );
  });

  it("throws when only one known field is present", () => {
    expect(() =>
      validateTemplate("Hi {{firstName}}, I came across your profile.")
    ).toThrow(TemplateTooFewFieldsError);
  });

  it("does not count unknown fields toward the minimum", () => {
    // {{fooBar}} is not a supported field, so this should fail the 2-field check
    expect(() =>
      validateTemplate("Hi {{firstName}}, re: {{fooBar}}")
    ).toThrow(TemplateTooFewFieldsError);
  });

  it("does not count the same field twice", () => {
    // {{firstName}} used twice but it's only one unique known field
    expect(() =>
      validateTemplate("{{firstName}}! Hi {{firstName}}, how are you?")
    ).toThrow(TemplateTooFewFieldsError);
  });

  it("passes when two different known fields are used even if repeated", () => {
    expect(() =>
      validateTemplate("Hey {{firstName}}, I work with {{company}} clients. {{firstName}}, let's chat!")
    ).not.toThrow();
  });
});
