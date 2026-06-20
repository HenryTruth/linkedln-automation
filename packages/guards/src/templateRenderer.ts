export interface TemplateFields {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  // Content signal fields
  postExcerpt?: string | null;
  postTopic?: string | null;
  postDate?: string | null;
}

const FIELD_PATTERN = /\{\{(\w+)\}\}/g;
const SUPPORTED_FIELDS = new Set([
  "firstName", "lastName", "company", "title",
  "postExcerpt", "postTopic", "postDate",
]);
const MIN_DYNAMIC_FIELDS = 2;

export class TemplateTooFewFieldsError extends Error {
  constructor(found: number) {
    super(
      `Message template must contain at least ${MIN_DYNAMIC_FIELDS} dynamic fields ({{firstName}}, {{company}}, etc.) — found ${found}`
    );
    this.name = "TemplateTooFewFieldsError";
  }
}

export function validateTemplate(template: string): void {
  const matches = [...template.matchAll(FIELD_PATTERN)];
  const uniqueFields = new Set(
    matches.map((m) => m[1]).filter((f) => SUPPORTED_FIELDS.has(f))
  );

  if (uniqueFields.size < MIN_DYNAMIC_FIELDS) {
    throw new TemplateTooFewFieldsError(uniqueFields.size);
  }
}

export function renderTemplate(template: string, fields: TemplateFields): string {
  return template.replace(FIELD_PATTERN, (match, key) => {
    const value = fields[key as keyof TemplateFields];
    return value ?? match; // leave placeholder intact if field is missing
  });
}
