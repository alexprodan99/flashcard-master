import JSZip from "jszip";

export function createMinimalPdf(text: string, meta?: { title?: string; author?: string }): Buffer {
  const streamContent = `BT /F1 12 Tf 100 700 Td (${text}) Tj ET`;
  const streamLength = Buffer.byteLength(streamContent);
  let infoObj = "";
  let infoRef = "";
  if (meta) {
    const titleEntry = meta.title ? `/Title (${meta.title})` : "";
    const authorEntry = meta.author ? `/Author (${meta.author})` : "";
    infoObj = `6 0 obj\n<< ${titleEntry} ${authorEntry} >>\nendobj\n`;
    infoRef = "/Info 6 0 R";
  }
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
${infoObj}trailer
<< /Size ${meta ? 7 : 6} /Root 1 0 R ${infoRef} >>
%%EOF`;
  return Buffer.from(pdfString);
}

export function createEmptyScannedPdf(pagesCount: number = 3): Buffer {
  const pageObjectIds: number[] = [];
  let objects = "";
  for (let i = 0; i < pagesCount; i++) {
    const pageId = 3 + i;
    pageObjectIds.push(pageId);
    objects += `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  }
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [${kids}] /Count ${pagesCount} >>
endobj
${objects}trailer
<< /Root 1 0 R >>
%%EOF`;
  return Buffer.from(pdfString);
}

export function createMultiPagePdf(pagesLines: string[][]): Buffer {
  const count = pagesLines.length;
  const pageObjectIds: number[] = [];
  let objects = "";
  const fontId = 3 + count * 2;

  pagesLines.forEach((lines, idx) => {
    const pageId = 3 + idx * 2;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);

    let streamText = "BT\n/F1 12 Tf\n50 720 Td\n";
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) {
        streamText += "0 -30 Td\n";
      }
      const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      streamText += `(${escaped}) Tj\n`;
    });
    streamText += "\nET";
    const streamLength = Buffer.byteLength(streamText);

    objects += `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`;
    objects += `${contentId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}\nendstream\nendobj\n`;
  });

  const fontObject = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");

  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [${kids}] /Count ${count} >>
endobj
${objects}${fontObject}trailer
<< /Root 1 0 R >>
%%EOF`;
  return Buffer.from(pdfString);
}

export async function createMinimalDocx(options: {
  heading?: string;
  paragraph?: string;
  table?: string[][];
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  let bodyXml = "";
  if (options.heading) {
    bodyXml += `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>${options.heading}</w:t></w:r>
    </w:p>`;
  }
  if (options.paragraph) {
    bodyXml += `
    <w:p>
      <w:r><w:t>${options.paragraph}</w:t></w:r>
    </w:p>`;
  }
  if (options.table) {
    bodyXml += `\n<w:tbl>`;
    for (const row of options.table) {
      bodyXml += `\n<w:tr>`;
      for (const cell of row) {
        bodyXml += `\n<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`;
      }
      bodyXml += `\n</w:tr>`;
    }
    bodyXml += `\n</w:tbl>`;
  }

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}
  </w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: "nodebuffer" });
}

export function createLegacyDocBuffer(): Buffer {
  // CFBF / OLE magic bytes
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
}

export function createCyrillicPdf(): Buffer {
  const toUnicode =
    "/CIDInit /ProcSet findresource begin\n" +
    "12 dict begin\n" +
    "begincmap\n" +
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
    "/CMapName /Custom def\n" +
    "/CMapType 2 def\n" +
    "1 begincodespacerange\n" +
    "<0000> <FFFF>\n" +
    "endcodespacerange\n" +
    "1 beginbfrange\n" +
    "<0001> <0050> <0410>\n" +
    "endbfrange\n" +
    "endcmap\n" +
    "CMapName currentdict /CMap defineresource pop\n" +
    "end\n" +
    "end";

  // 26 Cyrillic glyphs from 0x0001 to 0x001a (А to Щ)
  const hex =
    "000100020003000400050006000700080009000a000b000c000d000e000f0010001100120013001400150016001700180019001a";
  const streamText = `BT\n/F1 12 Tf\n<${hex}> Tj\nET`;
  const streamLength = Buffer.byteLength(streamText);
  const toUnicodeLength = Buffer.byteLength(toUnicode);

  const pdfStr = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamText}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>
endobj
6 0 obj
<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor << /Type /FontDescriptor /FontName /Arial >> >>
endobj
7 0 obj
<< /Length ${toUnicodeLength} >>
stream
${toUnicode}
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;

  return Buffer.from(pdfStr);
}
