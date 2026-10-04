import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fallback native PDF stream text extractor using Node's built-in zlib.
 * Handles FlateDecode compressed streams and raw BT/ET text blocks when pdf.js fails.
 */
function extractPdfTextWithZlib(buffer: Buffer): string {
  const pieces: string[] = [];

  const decodePdfLiteral = (raw: string): string => {
    return raw
      .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  };

  const decodeHexText = (hex: string): string => {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length === 0) return '';
    // Check UTF-16BE BOM or 4-hex-digit sequences
    let out = '';
    for (let i = 0; i < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16);
      if (!isNaN(code) && code >= 32 && code <= 126) {
        out += String.fromCharCode(code);
      } else if (!isNaN(code) && code > 126) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  };

  const parseContentStream = (content: string) => {
    // Match BT ... ET blocks or whole stream if BT/ET not cleanly delimited
    const btBlocks = content.match(/BT[\s\S]*?ET/g) || [content];
    for (const block of btBlocks) {
      // 1. Array text operators: [(...) -10 (...) ] TJ
      const tjArrays = block.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      for (const arr of tjArrays) {
        const literals = arr.match(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g) || [];
        let line = '';
        for (const lit of literals) {
          if (lit.startsWith('(') && lit.endsWith(')')) {
            line += decodePdfLiteral(lit.slice(1, -1));
          } else if (lit.startsWith('<') && lit.endsWith('>')) {
            line += decodeHexText(lit.slice(1, -1));
          }
        }
        if (line.trim()) pieces.push(line);
      }

      // 2. Single string text operators: (...) Tj, (...) ', (...) "
      const singleMatches = block.match(/\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")/g) || [];
      for (const m of singleMatches) {
        const inner = m.replace(/\)\s*(?:Tj|'|")$/, '').slice(1);
        const decoded = decodePdfLiteral(inner);
        if (decoded.trim()) pieces.push(decoded);
      }
    }
  };

  // Scan all stream ... endstream sections
  const binaryStr = buffer.toString('latin1');
  let searchPos = 0;
  while (searchPos < binaryStr.length) {
    const streamIdx = binaryStr.indexOf('stream', searchPos);
    if (streamIdx === -1) break;

    // Make sure it's not 'endstream'
    if (streamIdx >= 3 && binaryStr.slice(streamIdx - 3, streamIdx) === 'end') {
      searchPos = streamIdx + 6;
      continue;
    }

    let dataStart = streamIdx + 6;
    if (binaryStr[dataStart] === '\r' && binaryStr[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (binaryStr[dataStart] === '\n' || binaryStr[dataStart] === '\r') {
      dataStart += 1;
    } else {
      searchPos = streamIdx + 6;
      continue;
    }

    const endStreamIdx = binaryStr.indexOf('endstream', dataStart);
    if (endStreamIdx === -1) break;

    let dataEnd = endStreamIdx;
    if (binaryStr[dataEnd - 2] === '\r' && binaryStr[dataEnd - 1] === '\n') {
      dataEnd -= 2;
    } else if (binaryStr[dataEnd - 1] === '\n' || binaryStr[dataEnd - 1] === '\r') {
      dataEnd -= 1;
    }

    const rawSlice = buffer.subarray(dataStart, dataEnd);
    let decompressed: string | null = null;

    try {
      decompressed = zlib.inflateSync(rawSlice).toString('latin1');
    } catch {
      try {
        decompressed = zlib.inflateRawSync(rawSlice).toString('latin1');
      } catch {
        // Might be an uncompressed stream
        const asLatin = rawSlice.toString('latin1');
        if (asLatin.includes('BT') && (asLatin.includes('Tj') || asLatin.includes('TJ'))) {
          decompressed = asLatin;
        }
      }
    }

    if (decompressed && (decompressed.includes('Tj') || decompressed.includes('TJ'))) {
      parseContentStream(decompressed);
    }

    searchPos = endStreamIdx + 9;
  }

  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract text from PDF buffer using static requires so Vercel Serverless NFT
 * bundles pdf.js and pdf.worker.js without triggering pdf-parse/index.js debug mode.
 */
async function extractPdfTextServer(buffer: Buffer): Promise<string> {
  // 1. Primary: Direct pdf-parse/lib/pdf-parse.js + static pdf.js / pdf.worker.js require
  try {
    // Static literal requires ensure Vercel's @vercel/nft includes these files in Lambda
    require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.worker.js');
    const PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');

    const data = await pdfParse(buffer);
    if (data?.text && data.text.trim().length > 0) {
      return data.text;
    }

    // Direct PDFJS fallback if pdfParse wrapper returned empty
    if (PDFJS && typeof PDFJS.getDocument === 'function') {
      PDFJS.disableWorker = true;
      const doc = await PDFJS.getDocument({ data: new Uint8Array(buffer) });
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        });
        const pageStr = (textContent.items || [])
          .map((item: any) => item.str || '')
          .join(' ');
        if (pageStr.trim()) pages.push(pageStr);
      }
      if (typeof doc.destroy === 'function') doc.destroy();
      const combined = pages.join('\n\n').trim();
      if (combined.length > 0) return combined;
    }
  } catch (pdfErr: any) {
    console.warn('Primary pdf.js extraction warning:', pdfErr?.message);
  }

  // 2. Secondary: Native zlib FlateDecode stream parser
  try {
    const zlibText = extractPdfTextWithZlib(buffer);
    if (zlibText.length > 0) {
      return zlibText;
    }
  } catch (zlibErr: any) {
    console.warn('Zlib PDF stream extraction warning:', zlibErr?.message);
  }

  // 3. Tertiary: Gemini multimodal OCR if API key is configured (handles scanned/image PDFs)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (geminiKey && buffer.length < 15 * 1024 * 1024) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: buffer.toString('base64'),
                  },
                },
                {
                  text: 'Extract all readable text from this PDF document verbatim. Return only the extracted plain text without any commentary or markdown formatting.',
                },
              ],
            },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const ocrText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (ocrText && ocrText.trim().length > 0) {
          return ocrText.trim();
        }
      }
    } catch (ocrErr: any) {
      console.warn('Gemini PDF OCR fallback warning:', ocrErr?.message);
    }
  }

  return '';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file was provided in the upload request.' },
        { status: 400 }
      );
    }

    const fileName = file.name || 'document';
    const lowerName = fileName.toLowerCase();
    const mimeType = (file.type || '').toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detect file format by extension, MIME type, or magic bytes (critical for Android file pickers)
    const isPdf =
      lowerName.endsWith('.pdf') ||
      mimeType === 'application/pdf' ||
      buffer.subarray(0, 5).toString('ascii') === '%PDF-';

    const isDocx =
      !isPdf &&
      (lowerName.endsWith('.docx') ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        buffer.subarray(0, 4).toString('binary') === 'PK\x03\x04');

    let extractedText = '';

    if (isDocx) {
      // Extract from Microsoft Word (.docx)
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value || '';
    } else if (isPdf) {
      extractedText = await extractPdfTextServer(buffer);
    } else {
      // Plain text, Markdown, RTF, CSV, HTML
      extractedText = buffer.toString('utf-8');
      extractedText = extractedText.replace(/<[^>]*>?/gm, ' ');
    }

    // Clean whitespace and remove control characters
    const cleaned = extractedText
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    if (!cleaned) {
      return NextResponse.json(
        { error: 'Could not extract readable text from this file. The file may be empty or an image-only scan.' },
        { status: 422 }
      );
    }

    const words = cleaned.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      success: true,
      text: cleaned,
      fileName,
      wordCount: words,
      characterCount: cleaned.length,
    });

  } catch (error: any) {
    console.error('Error in /api/extract-text:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to extract text from file.' },
      { status: 500 }
    );
  }
}

