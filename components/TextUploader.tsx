'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Sparkles, 
  RotateCcw, 
  AlertTriangle, 
  Globe, 
  ShieldCheck,
  CheckCircle2,
  X,
  FileUp,
  Loader2
} from 'lucide-react';

interface TextUploaderProps {
  onAnalyze: (payload: {
    text: string;
    title: string;
    checkParaphrase: boolean;
    checkWebPlagiarism: boolean;
    checkAiWriting: boolean;
    checkGrammar: boolean;
    excludeUrl?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

const SAMPLE_TEXTS = {
  paraphrased: `Recent advancements in artificial intelligence have brought about revolutionary transformations across multiple sectors of human activity. Specifically, machine learning architectures are utilized to automate intricate cognitive procedures. Furthermore, empirical investigations demonstrate that these automated tools streamline administrative burdens substantially. Notwithstanding these advantages, researchers emphasize that ethical dilemmas concerning algorithmic bias and data confidentiality must be thoroughly mitigated before widespread institutional deployment can be deemed responsible.`,
  plagiarized: `Artificial intelligence is intelligence demonstrated by machines, as opposed to the natural intelligence displayed by animals including humans. AI textbooks define the field as the study of intelligent agents: any system that perceives its environment and takes actions that maximize its chance of achieving its goals. Alan Turing was the first person to conduct substantial research in the field of machine learning, proposing the famous imitation game to test machine intelligence.`,
  original: `During our laboratory experiments this semester, we tested three distinct pathfinding algorithms across twenty simulated maze environments. While Dijkstra's algorithm consistently yielded mathematically shortest routes, its computational overhead was 40% higher than the A* implementation using Manhattan distance heuristics. Our team documented that embedded microcontroller limitations often require compromising theoretical perfection in favor of execution speed.`,
};

export default function TextUploader({ onAnalyze, isLoading }: TextUploaderProps) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [excludeUrl, setExcludeUrl] = useState('');
  const [showExcludeUrl, setShowExcludeUrl] = useState(false);
  const [checkParaphrase, setCheckParaphrase] = useState(true);
  const [checkWebPlagiarism, setCheckWebPlagiarism] = useState(true);
  const [checkAiWriting, setCheckAiWriting] = useState(true);
  const [checkGrammar, setCheckGrammar] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const charCount = text.length;

  // Browser-side PDF.js text extraction (handles Vercel >4.5MB payload limits & modern CMap PDFs)
  const extractPdfInBrowser = async (file: File): Promise<string> => {
    try {
      const win = window as any;
      if (!win.pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load browser PDF reader'));
          document.head.appendChild(script);
        });
      }

      const pdfjsLib = win.pdfjsLib;
      if (!pdfjsLib) return '';

      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
      });

      const pdf = await loadingTask.promise;
      const pagesText: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageStr = (textContent.items || [])
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ');
        if (pageStr.trim()) {
          pagesText.push(pageStr.trim());
        }
      }

      return pagesText.join('\n\n').trim();
    } catch (e) {
      console.warn('Browser PDF extraction fallback warning:', e);
      return '';
    }
  };

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setSuccessNotice(null);
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('File size exceeds 15MB. Please upload a smaller document.');
      return;
    }

    const name = file.name || 'document.pdf';
    const lowerName = name.toLowerCase();
    let isPdfFile = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdfFile && file.size >= 5) {
      try {
        const header = await file.slice(0, 5).text();
        if (header === '%PDF-') isPdfFile = true;
      } catch {
        // ignore header read errors
      }
    }
    setIsExtracting(true);
    setFileName(name);

    if (!title) {
      setTitle(name.replace(/\.[^/.]+$/, ''));
    }

    try {
      // 1. Fast local read for plain text & markdown
      if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
        const textContent = await file.text();
        if (textContent.trim()) {
          setText(textContent.trim());
          setSuccessNotice(`Successfully loaded ${name} (${textContent.trim().split(/\s+/).length} words)`);
          setIsExtracting(false);
          return;
        }
      }

      // 2. If PDF > 4MB (Vercel Serverless body limit is 4.5MB), extract in browser first
      if (isPdfFile && file.size > 4 * 1024 * 1024) {
        const browserText = await extractPdfInBrowser(file);
        if (browserText) {
          const count = browserText.split(/\s+/).filter(Boolean).length;
          setText(browserText);
          setSuccessNotice(`Successfully extracted ${count} words from ${name}`);
          return;
        }
      }

      // 3. Server-side text extractor for .docx, .pdf, and other formats
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok && data?.text) {
        setText(data.text);
        setSuccessNotice(`Successfully extracted ${data.wordCount} words from ${name}`);
        return;
      }

      // 4. Fallback to client-side PDF.js if server extraction failed or returned empty on Vercel
      if (isPdfFile) {
        const browserText = await extractPdfInBrowser(file);
        if (browserText) {
          const count = browserText.split(/\s+/).filter(Boolean).length;
          setText(browserText);
          setSuccessNotice(`Successfully extracted ${count} words from ${name}`);
          return;
        }
      }

      throw new Error(data?.error || 'Failed to extract text from document.');
    } catch (err: any) {
      console.error('File extraction error:', err);
      setErrorMsg(err.message || 'Could not parse document. You can also copy and paste the text directly into the box.');
    } finally {
      setIsExtracting(false);
      // Reset input value so the same file can be chosen again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const loadSample = (type: 'paraphrased' | 'plagiarized' | 'original') => {
    setText(SAMPLE_TEXTS[type]);
    const titles = {
      paraphrased: 'AI Ethics Literature Review (Paraphrased & Patchwritten)',
      plagiarized: 'Artificial Intelligence History (Direct Verbatim Plagiarism)',
      original: 'Robotics Lab Report (Authentic Student Original)',
    };
    setTitle(titles[type]);
    setFileName(null);
    setErrorMsg(null);
    setSuccessNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!text.trim()) {
      setErrorMsg('Please paste or upload text to check.');
      return;
    }

    if (text.trim().length < 20) {
      setErrorMsg('Please enter at least 20 characters for deep academic analysis.');
      return;
    }

    await onAnalyze({
      text,
      title: title.trim() || 'Untitled Manuscript',
      checkParaphrase,
      checkWebPlagiarism,
      checkAiWriting,
      checkGrammar,
      excludeUrl: excludeUrl.trim() || undefined,
    });
  };

  const handleReset = () => {
    setText('');
    setTitle('');
    setExcludeUrl('');
    setFileName(null);
    setErrorMsg(null);
    setSuccessNotice(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="uploader-card">
      <form onSubmit={handleSubmit} className="uploader-form">
        {/* Document Header Controls */}
        <div className="uploader-header">
          <div className="input-group-title">
            <input
              type="text"
              className="text-input-field"
              placeholder="Document or Manuscript Title (e.g. Research Literature Review)..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading || isExtracting}
            />
          </div>

          <div className="sample-buttons" role="group" aria-label="Load sample text">
            <span className="sample-label">Load preset:</span>
            <button
              type="button"
              className="btn-sample"
              onClick={() => loadSample('paraphrased')}
              disabled={isLoading || isExtracting}
            >
              Paraphrased
            </button>
            <button
              type="button"
              className="btn-sample"
              onClick={() => loadSample('plagiarized')}
              disabled={isLoading || isExtracting}
            >
              Direct Match
            </button>
            <button
              type="button"
              className="btn-sample"
              onClick={() => loadSample('original')}
              disabled={isLoading || isExtracting}
            >
              Authentic Draft
            </button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.rtf,.doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden-file-input"
          onChange={handleFileChange}
          disabled={isLoading || isExtracting}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />

        {/* Dropzone & Upload Button Bar */}
        <div
          className={`dropzone ${dragActive ? 'dropzone-active' : ''} ${isExtracting ? 'dropzone-loading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => {
            if (!isExtracting && !isLoading) {
              fileInputRef.current?.click();
            }
          }}
        >
          <div className="dropzone-content">
            {isExtracting ? (
              <div className="dropzone-loading-inner">
                <Loader2 className="spinner-icon text-emerald" size={20} />
                <span>Extracting text from <strong>{fileName}</strong>...</span>
              </div>
            ) : fileName ? (
              <div className="file-loaded-row">
                <span className="file-loaded">
                  <FileText size={16} />
                  <span>Active file: <strong>{fileName}</strong></span>
                </span>
                <button
                  type="button"
                  className="btn-remove-file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName(null);
                    setSuccessNotice(null);
                  }}
                  title="Remove file"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="dropzone-default-row">
                <UploadCloud className="dropzone-icon" size={20} />
                <div className="dropzone-text">
                  <span className="dropzone-lead">
                    Drop a document here, or{' '}
                    <button
                      type="button"
                      className="btn-inline-browse"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      browse files
                    </button>
                  </span>
                  <span className="dropzone-sub">
                    PDF (.pdf) · Word (.docx) · Plain Text (.txt) · Markdown (.md) · Max 15 MB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Success Notice if file parsed */}
        {successNotice && (
          <div className="file-success-banner">
            <CheckCircle2 size={15} />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Main Textarea */}
        <div className="textarea-wrapper">
          <textarea
            className="main-textarea"
            placeholder="Paste your manuscript, article, or research draft here to inspect for verbatim matches, semantic paraphrasing, AI cadence, and clarity..."
            rows={11}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading || isExtracting}
          />

          <div className="textarea-footer">
            <div className="counter-stats">
              <span className="stat-item">
                <strong>{wordCount.toLocaleString()}</strong> / 2,500 words
              </span>
              <span className="stat-separator" aria-hidden="true">·</span>
              <span className="stat-item"><strong>{charCount.toLocaleString()}</strong> chars</span>
              <span className="stat-separator" aria-hidden="true">·</span>
              <span className="stat-item">~<strong>{Math.max(1, Math.ceil(wordCount / 200))}</strong> min read</span>
            </div>

            <div className="textarea-right-actions">
              <button
                type="button"
                className="btn-link-action"
                onClick={() => setShowExcludeUrl(!showExcludeUrl)}
              >
                <Globe size={13} />
                <span>{showExcludeUrl ? 'Hide Exclude URL' : 'Exclude Source URL'}</span>
              </button>

              {text && (
                <button
                  type="button"
                  className="btn-clear"
                  onClick={handleReset}
                  disabled={isLoading || isExtracting}
                  title="Clear text"
                >
                  <RotateCcw size={13} /> Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Exclude URL field */}
        {showExcludeUrl && (
          <div className="exclude-url-box">
            <label htmlFor="exclude-url-input" className="exclude-url-label">
              <Globe size={14} /> Exclude specific URL from similarity matching (e.g. your own published preprint or repository):
            </label>
            <input
              id="exclude-url-input"
              type="url"
              className="text-input-field"
              placeholder="https://example.org/published-draft"
              value={excludeUrl}
              onChange={(e) => setExcludeUrl(e.target.value)}
              disabled={isLoading || isExtracting}
            />
          </div>
        )}

        {/* Analysis Parameters */}
        <div className="options-panel">
          <div className="options-grid">
            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={checkParaphrase}
                onChange={(e) => setCheckParaphrase(e.target.checked)}
                disabled={isLoading || isExtracting}
              />
              <div className="checkbox-info">
                <span className="checkbox-title">Paraphrase & Patchwriting</span>
                <span className="checkbox-desc">Detects synonym swaps & clause restructuring</span>
              </div>
            </label>

            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={checkWebPlagiarism}
                onChange={(e) => setCheckWebPlagiarism(e.target.checked)}
                disabled={isLoading || isExtracting}
              />
              <div className="checkbox-info">
                <span className="checkbox-title">Web & Publication Index</span>
                <span className="checkbox-desc">Cross-checks indexed repositories & articles</span>
              </div>
            </label>

            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={checkAiWriting}
                onChange={(e) => setCheckAiWriting(e.target.checked)}
                disabled={isLoading || isExtracting}
              />
              <div className="checkbox-info">
                <span className="checkbox-title">AI Authorship Cadence</span>
                <span className="checkbox-desc">Evaluates sentence burstiness & perplexity</span>
              </div>
            </label>

            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={checkGrammar}
                onChange={(e) => setCheckGrammar(e.target.checked)}
                disabled={isLoading || isExtracting}
              />
              <div className="checkbox-info">
                <span className="checkbox-title">Grammar & Tone Clarity</span>
                <span className="checkbox-desc">Flags passive voice & structural readability</span>
              </div>
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Primary Action & Unboxed Metadata */}
        <div className="uploader-bottom-bar">
          <div className="uploader-trust-bar">
            <span>Zero public data retention</span>
            <span aria-hidden="true">·</span>
            <span>Sentence-level diagnostics</span>
            <span aria-hidden="true">·</span>
            <span>APA 7th & MLA 9th citations</span>
          </div>

          <button
            type="submit"
            className="btn-check-plagiarism-main"
            disabled={isLoading || isExtracting || wordCount === 0}
          >
            {isLoading ? (
              <>
                <div className="spinner" />
                <span>Analyzing Document...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Analyze Document</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
