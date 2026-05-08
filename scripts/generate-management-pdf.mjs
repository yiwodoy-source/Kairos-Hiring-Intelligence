import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const inputPath = path.join(rootDir, 'MANAGEMENT_SUMMARY_CONCISE.md');
const outputDir = path.join(rootDir, 'documents');
const outputPath = path.join(outputDir, 'NexusHR_AI_Management_Summary.pdf');

function markdownToLines(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      if (line.startsWith('# ')) return [{ text: line.slice(2), size: 20, bold: true, gap: 16 }];
      if (line.startsWith('## ')) return [{ text: line.slice(3), size: 14, bold: true, gap: 12 }];
      if (line.startsWith('- ')) return [{ text: `- ${line.slice(2)}`, size: 10, bold: false, gap: 6 }];
      if (/^\d+\.\s/.test(line)) return [{ text: line, size: 10, bold: false, gap: 6 }];
      if (!line.trim()) return [{ text: '', size: 10, bold: false, gap: 8 }];
      return [{ text: line, size: 10, bold: false, gap: 6 }];
    });
}

function sanitizePdfText(text) {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text, maxChars) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

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

function paginate(items) {
  const pages = [];
  let page = [];
  let y = 760;

  for (const item of items) {
    const maxChars = item.size >= 14 ? 62 : 88;
    const wrapped = wrapText(item.text, maxChars);
    const lineHeight = item.size + 5;
    const blockHeight = wrapped.length * lineHeight + item.gap;

    if (y - blockHeight < 60 && page.length > 0) {
      pages.push(page);
      page = [];
      y = 760;
    }

    page.push({ ...item, wrapped, y });
    y -= blockHeight;
  }

  if (page.length > 0) pages.push(page);
  return pages;
}

function buildPdf(pages) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageObjectIds = [];

  for (const [pageIndex, blocks] of pages.entries()) {
    const commands = ['BT'];
    for (const block of blocks) {
      let y = block.y;
      const font = block.bold ? 'F2' : 'F1';
      for (const line of block.wrapped) {
        if (!line) {
          y -= block.size + 5;
          continue;
        }
        commands.push(`/${font} ${block.size} Tf`);
        commands.push(`1 0 0 1 54 ${y} Tm`);
        commands.push(`(${sanitizePdfText(line)}) Tj`);
        y -= block.size + 5;
      }
    }
    commands.push('/F1 8 Tf');
    commands.push(`1 0 0 1 54 32 Tm`);
    commands.push(`(NexusHR AI - Management Summary | Page ${pageIndex + 1}) Tj`);
    commands.push('ET');

    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  }

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`);
  for (const pageId of pageObjectIds) {
    objects[pageId - 1] = objects[pageId - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
  }
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

const markdown = await readFile(inputPath, 'utf8');
const pages = paginate(markdownToLines(markdown));
const pdf = buildPdf(pages);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, pdf, 'binary');
console.log(outputPath);
