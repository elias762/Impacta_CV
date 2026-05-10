import mammoth from "mammoth";

export async function extractCvText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      // pdf-parse has a top-level side effect when imported normally, so require lazily.
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text.trim();
    }
    if (lower.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    if (lower.endsWith(".txt")) {
      return buffer.toString("utf8").trim();
    }
  } catch (err) {
    console.error(`CV text extraction failed for ${filename}:`, err);
  }
  return "";
}

export function isAllowedCvFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".txt");
}
