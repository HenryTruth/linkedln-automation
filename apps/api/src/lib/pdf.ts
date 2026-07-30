import type { DocumentPlan } from "./ai.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textLine(text: string, x: number, y: number, size: number) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function pageContent(page: DocumentPlan["pages"][number], index: number, total: number, title: string) {
  const lines: string[] = [];
  lines.push("0.06 0.09 0.16 rg");
  lines.push(`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`);
  lines.push("0.11 0.75 0.69 rg");
  lines.push("48 720 96 6 re f");
  lines.push("1 1 1 rg");
  lines.push(textLine(title.slice(0, 62), 48, 674, 18));
  lines.push("0.86 0.94 0.94 rg");
  lines.push(textLine(page.heading.slice(0, 58), 48, 612, 30));

  let y = 548;
  for (const bullet of page.bullets.slice(0, 5)) {
    lines.push("0.11 0.75 0.69 rg");
    lines.push(`52 ${y + 5} 6 6 re f`);
    lines.push("0.92 0.95 0.96 rg");
    for (const wrapped of wrapText(bullet, 66).slice(0, 3)) {
      lines.push(textLine(wrapped, 74, y, 15));
      y -= 24;
    }
    y -= 16;
  }

  lines.push("0.45 0.55 0.60 rg");
  lines.push(textLine(`${index + 1} / ${total}`, 48, 48, 11));
  return lines.join("\n");
}

export function renderDocumentPdf(plan: DocumentPlan) {
  const safePlan = {
    ...plan,
    pages: plan.pages.length > 0 ? plan.pages.slice(0, 8) : [{ heading: plan.title, bullets: [plan.subtitle] }],
  };
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  void catalogId;
  const pagesId = 2;
  objects.push("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (let i = 0; i < safePlan.pages.length; i += 1) {
    const content = pageContent(safePlan.pages[i], i, safePlan.pages.length, safePlan.title);
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}
