import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import JSZip from 'jszip';
import { EpubFlashcardExporter } from '@flashcard-master/adapters';
import type { Flashcard } from '@flashcard-master/core';

function isEpubcheckInstalled(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where epubcheck' : 'which epubcheck';
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function validateEpubStructure(epubBuffer: Buffer): Promise<void> {
  // 1. Verify byte-0 STORE mimetype
  if (epubBuffer.toString('ascii', 0, 2) !== 'PK') {
    throw new Error('EPUB file is not a valid ZIP archive (missing PK magic bytes)');
  }
  const compressionMethod = epubBuffer.readUInt16LE(8);
  if (compressionMethod !== 0) {
    throw new Error(`EPUB mimetype must use STORE compression (method 0), got: ${compressionMethod}`);
  }

  // 2. Load ZIP
  const zip = await JSZip.loadAsync(epubBuffer);

  // 3. Verify mimetype content
  const mimetype = await zip.file('mimetype')?.async('string');
  if (mimetype !== 'application/epub+zip') {
    throw new Error(`Invalid mimetype: expected 'application/epub+zip', got: '${mimetype}'`);
  }

  // 4. Verify container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml || !containerXml.includes('full-path="OEBPS/content.opf"')) {
    throw new Error('META-INF/container.xml missing or does not reference OEBPS/content.opf');
  }

  // 5. Verify OPF package document
  const opf = await zip.file('OEBPS/content.opf')?.async('string');
  if (!opf) throw new Error('OEBPS/content.opf missing from EPUB archive');
  if (!opf.includes('version="3.0"')) throw new Error('content.opf missing EPUB version="3.0" declaration');
  if (!opf.includes('<dc:identifier id="BookId">')) throw new Error('content.opf missing BookId identifier');
  if (!opf.includes('<meta property="dcterms:modified">')) throw new Error('content.opf missing dcterms:modified metadata');
  if (!opf.includes('<manifest>') || !opf.includes('</manifest>')) throw new Error('content.opf missing manifest');
  if (!opf.includes('<spine') || !opf.includes('</spine>')) throw new Error('content.opf missing spine');

  // 6. Verify Navigation Document
  const nav = await zip.file('OEBPS/nav.xhtml')?.async('string');
  if (!nav) throw new Error('OEBPS/nav.xhtml navigation document missing');
  if (!nav.includes('epub:type="toc"')) throw new Error('nav.xhtml missing epub:type="toc"');
  if (!nav.includes('epub:type="landmarks"')) throw new Error('nav.xhtml missing epub:type="landmarks"');

  // 7. Verify deck content XHTML
  const deckXhtml = await zip.file('OEBPS/deck_1.xhtml')?.async('string');
  if (!deckXhtml) throw new Error('OEBPS/deck_1.xhtml deck chapter content missing');
  if (!deckXhtml.includes('<details class="flashcard"')) throw new Error('deck_1.xhtml missing interactive flashcard details');
}

async function main() {
  console.log('📚 Starting Automated EPUB 3.0 Conformance Validation...');

  const sampleCards: Flashcard[] = [
    {
      id: 'card-val-1',
      question: 'What is Raft consensus?',
      answer: 'A consensus algorithm designed for ease of understanding and fault-tolerant log replication.',
      difficulty: 'intermediate',
      sourceQuote: 'Raft is a consensus algorithm for managing a replicated log.',
      sourceLocator: 'Chapter 3, page 42',
      documentTitle: 'Distributed Consensus Guide',
      sourceOriginUrl: 'https://example.com/raft',
      targetDeck: 'Distributed Systems',
      personaUsed: 'socratic-mentor',
      tags: ['consensus', 'distributed'],
      keywords: ['raft', 'quorum'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'card-val-2',
      question: 'How do leader heartbeats maintain authority?',
      answer: 'Leaders send periodic AppendEntries RPCs with no log entries to prevent election timeouts.',
      difficulty: 'expert',
      sourceQuote: 'Leaders send periodic heartbeats to all followers to maintain their authority.',
      sourceLocator: 'Chapter 3, page 45',
      documentTitle: 'Distributed Consensus Guide',
      targetDeck: 'Distributed Systems',
      personaUsed: 'strict-examiner',
      tags: ['raft', 'leader-election'],
      keywords: ['heartbeat', 'leader'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const exporter = new EpubFlashcardExporter();
  const fakeCover = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const exportResult = await exporter.export(sampleCards, {
    coverImage: fakeCover,
    includeToc: true,
    includeBadges: true,
  });

  const buffer = Buffer.isBuffer(exportResult.data)
    ? exportResult.data
    : Buffer.from(exportResult.data as any);

  // 1. Structural Conformance Verification
  console.log('🔍 Running internal EPUB 3.0 structural conformance assertions...');
  await validateEpubStructure(buffer);
  console.log('✓ Structural EPUB 3.0 container and XML validation passed.');

  // 2. EPUBCheck CLI Verification
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epubcheck-val-'));
  const tempEpubPath = path.join(tempDir, 'study-guide.epub');
  fs.writeFileSync(tempEpubPath, buffer);

  try {
    const hasEpubcheck = isEpubcheckInstalled();
    if (hasEpubcheck) {
      console.log('🚀 Running official EPUBCheck CLI validation...');
      try {
        const output = execSync(`epubcheck "${tempEpubPath}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log(output);
        console.log('✓ Official EPUBCheck CLI: Valid EPUB 3.0 (0 fatal errors, 0 errors)');
      } catch (err: any) {
        console.error('❌ EPUBCheck CLI reported validation errors:');
        if (err.stdout) console.error(err.stdout.toString());
        if (err.stderr) console.error(err.stderr.toString());
        throw new Error('EPUBCheck CLI validation failed');
      }
    } else {
      if (process.env.CI && process.platform === 'linux') {
        throw new Error('Official epubcheck CLI is required in Linux CI pipeline but was not found!');
      } else {
        console.log('ℹ️ Official epubcheck CLI not found on host (installed in CI Linux). Structural EPUB 3.0 conformance assertions passed.');
      }
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('🎉 EPUB validation completed successfully!');
}

main().catch((err) => {
  console.error('Validation Error:', err);
  process.exit(1);
});
