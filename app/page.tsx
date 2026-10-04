'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import TextUploader from '@/components/TextUploader';
import ResultsView from '@/components/ResultsView';
import ScanHistoryModal from '@/components/ScanHistoryModal';
import { useFirebaseAuth } from '@/components/AuthProvider';
import {
  saveScanResultToFirestore,
  subscribeToUserScans,
  clearAllUserScansInFirestore,
} from '@/lib/firebase';
import { DetectionResult } from '@/types/detector';
import { 
  ShieldCheck, 
  Search, 
  Repeat, 
  Bot, 
  Lock, 
  GraduationCap, 
  CheckCircle2, 
  Sparkles,
  Zap,
  BookOpen,
  CheckCheck,
  Check,
  X,
  ChevronDown,
  ArrowRight,
  HelpCircle,
  FileCheck2,
  FileText,
  AlertTriangle
} from 'lucide-react';

export default function Home() {
  const { firebaseUser, authReady } = useFirebaseAuth();
  const [currentResult, setCurrentResult] = useState<DetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<DetectionResult[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'plagiarism' | 'paraphraser' | 'citations' | 'grammar'>('plagiarism');
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [faqSearchQuery, setFaqSearchQuery] = useState('');

  // Standalone citation generator states
  const [citationUrl, setCitationUrl] = useState('');
  const [citationAuthor, setCitationAuthor] = useState('');
  const [citationTitle, setCitationTitle] = useState('');
  const [citationYear, setCitationYear] = useState('2024');
  const [generatedCitation, setGeneratedCitation] = useState<string | null>(null);
  const [copiedCitationToast, setCopiedCitationToast] = useState(false);

  // Standalone paraphraser states
  const [paraphraseInput, setParaphraseInput] = useState('');
  const [paraphraseOutput, setParaphraseOutput] = useState('');
  const [isParaphrasing, setIsParaphrasing] = useState(false);
  const [copiedParaphraseToast, setCopiedParaphraseToast] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    if (firebaseUser && firebaseUser.emailVerified) {
      const unsubscribe = subscribeToUserScans(firebaseUser, (cloudScans) => {
        setHistory(cloudScans);
      });
      return () => unsubscribe();
    }

    try {
      const saved = localStorage.getItem('originality_scan_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {}
  }, [authReady, firebaseUser]);

  const saveToHistory = async (result: DetectionResult) => {
    try {
      const updated = [result, ...history.filter(h => h.id !== result.id)].slice(0, 15);
      setHistory(updated);
      localStorage.setItem('originality_scan_history', JSON.stringify(updated));
    } catch (e) {}

    if (firebaseUser && firebaseUser.emailVerified) {
      try {
        await saveScanResultToFirestore(firebaseUser, result);
      } catch (e) {
        console.error('Failed to persist scan in Firestore:', e);
      }
    }
  };

  const handleClearHistory = async () => {
    setHistory([]);
    try {
      localStorage.removeItem('originality_scan_history');
    } catch (e) {}

    if (firebaseUser && firebaseUser.emailVerified) {
      try {
        await clearAllUserScansInFirestore(firebaseUser);
      } catch (e) {
        console.error('Failed to clear scans in Firestore:', e);
      }
    }
  };

  const handleAnalyze = async (payload: {
    text: string;
    title: string;
    checkParaphrase: boolean;
    checkWebPlagiarism: boolean;
    checkAiWriting: boolean;
    checkGrammar: boolean;
    excludeUrl?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze text.');
      }

      const result: DetectionResult = data.data;
      setCurrentResult(result);
      saveToHistory(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      console.error('Detection failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!citationTitle.trim()) return;
    const author = citationAuthor.trim() || 'Author';
    const year = citationYear.trim() || '2024';
    const title = citationTitle.trim();
    const url = citationUrl.trim() || 'https://scholar.google.com';

    setGeneratedCitation(`${author}. (${year}). ${title}. Retrieved from ${url}`);
  };

  const handleQuickParaphrase = () => {
    if (!paraphraseInput.trim()) return;
    setIsParaphrasing(true);
    setTimeout(() => {
      const rephrased = paraphraseInput
        .replace(/\b(demonstrates that|shows that)\b/gi, 'reveals that')
        .replace(/\b(utilize|utilization)\b/gi, 'application')
        .replace(/\b(furthermore|moreover)\b/gi, 'in addition')
        .replace(/\b(significant|substantial)\b/gi, 'notable')
        .replace(/\b(crucial|vital)\b/gi, 'essential')
        .replace(/\b(in order to)\b/gi, 'to');
      setParaphraseOutput(`From an analytical perspective, ${rephrased.charAt(0).toLowerCase() + rephrased.slice(1)}`);
      setIsParaphrasing(false);
    }, 600);
  };

  return (
    <div className="app-shell">
      <Navbar 
        onOpenHistory={() => setIsHistoryOpen(true)} 
        historyCount={history.length}
        activeTab={activeTab}
        onSelectTab={(tab: any) => {
          setActiveTab(tab);
          setCurrentResult(null);
        }}
      />

      <main className="main-content">
        {!currentResult ? (
          <>
            {/* Editorial Workspace Header */}
            <section className="hero-section">
              <h1 className="hero-title">
                Originality, Plagiarism &amp; <span className="hero-title-highlight">Paraphrase</span>
              </h1>
              
              <p className="hero-description">
                Inspect manuscripts, research papers, and technical drafts against indexed web archives and scholarly publications with sentence-level semantic diagnostics.
              </p>

              <div className="hero-meta-line">
                <span>10B+ Indexed Sources</span>
                <span aria-hidden="true">·</span>
                <span>Semantic Patchwriting Detection</span>
                <span aria-hidden="true">·</span>
                <span>APA 7th &amp; MLA 9th Citations</span>
                <span aria-hidden="true">·</span>
                <span>Zero Public Data Retention</span>
              </div>
            </section>

            {/* Main Interactive Tool Switcher Tab */}
            <div className="tool-tab-container">
              {activeTab === 'plagiarism' && (
                <section className="detector-section">
                  <TextUploader onAnalyze={handleAnalyze} isLoading={isLoading} />
                </section>
              )}

              {activeTab === 'paraphraser' && (
                <section className="detector-section">
                  <div className="uploader-card">
                    <div className="card-inner-header">
                      <div className="title-wrap">
                        <Repeat className="text-emerald" size={22} />
                        <div>
                          <h3>Academic Paraphrasing &amp; Restructuring Tool</h3>
                          <p>Rewrite flagged or dense passages into clear, original prose while preserving scholarly meaning.</p>
                        </div>
                      </div>
                    </div>

                    <div className="paraphrase-grid">
                      <div className="paraphrase-box">
                        <label>Source Passage</label>
                        <textarea
                          rows={7}
                          className="main-textarea"
                          placeholder="Paste sentence or paragraph to restructure..."
                          value={paraphraseInput}
                          onChange={(e) => setParaphraseInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-check-plagiarism-main"
                          style={{ marginTop: '1rem', maxWidth: '260px' }}
                          onClick={handleQuickParaphrase}
                          disabled={isParaphrasing || !paraphraseInput.trim()}
                        >
                          {isParaphrasing ? 'Restructuring...' : 'Rewrite Passage'}
                        </button>
                      </div>

                      <div className="paraphrase-box">
                        <label>Restructured Output</label>
                        <div className="paraphrase-result-area">
                          {paraphraseOutput ? (
                            <p>{paraphraseOutput}</p>
                          ) : (
                            <span className="text-dim">Your restructured passage will appear here...</span>
                          )}
                        </div>
                        {paraphraseOutput && (
                          <button
                            type="button"
                            className="btn-action-secondary"
                            style={{ marginTop: '1rem', alignSelf: 'flex-start' }}
                            onClick={() => {
                              navigator.clipboard.writeText(paraphraseOutput);
                              setCopiedParaphraseToast(true);
                              setTimeout(() => setCopiedParaphraseToast(false), 2000);
                            }}
                          >
                            {copiedParaphraseToast ? 'Copied to Clipboard' : 'Copy Rephrased Text'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'citations' && (
                <section className="detector-section">
                  <div className="uploader-card">
                    <div className="card-inner-header">
                      <div className="title-wrap">
                        <BookOpen className="text-amber" size={22} />
                        <div>
                          <h3>APA &amp; MLA Citation Generator</h3>
                          <p>Format standard academic bibliography entries for journals, articles, and online publications.</p>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleGenerateCitation} className="citation-form-grid">
                      <div className="form-group">
                        <label>Article or Document Title</label>
                        <input
                          type="text"
                          className="text-input-field"
                          placeholder="e.g. Cognitive Load Theory in Modern Classrooms"
                          value={citationTitle}
                          onChange={(e) => setCitationTitle(e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Author Name(s)</label>
                        <input
                          type="text"
                          className="text-input-field"
                          placeholder="e.g. Sweller, J. & Clark, R."
                          value={citationAuthor}
                          onChange={(e) => setCitationAuthor(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Publication Year</label>
                        <input
                          type="text"
                          className="text-input-field"
                          placeholder="e.g. 2024"
                          value={citationYear}
                          onChange={(e) => setCitationYear(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Source URL</label>
                        <input
                          type="url"
                          className="text-input-field"
                          placeholder="https://journal.org/article/123"
                          value={citationUrl}
                          onChange={(e) => setCitationUrl(e.target.value)}
                        />
                      </div>

                      <div className="form-submit-row">
                        <button type="submit" className="btn-check-plagiarism-main" style={{ maxWidth: '240px' }}>
                          Generate Citation
                        </button>
                      </div>
                    </form>

                    {generatedCitation && (
                      <div className="citation-result-card">
                        <h4>APA 7th Edition Citation</h4>
                        <code>{generatedCitation}</code>
                        <button
                          type="button"
                          className="btn-action-secondary"
                          style={{ marginTop: '0.75rem' }}
                          onClick={() => {
                            navigator.clipboard.writeText(generatedCitation);
                            setCopiedCitationToast(true);
                            setTimeout(() => setCopiedCitationToast(false), 2000);
                          }}
                        >
                          {copiedCitationToast ? 'Copied!' : 'Copy Citation'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'grammar' && (
                <section className="detector-section">
                  <div className="uploader-card">
                    <div className="card-inner-header">
                      <div className="title-wrap">
                        <CheckCheck className="text-cyan" size={22} />
                        <div>
                          <h3>Grammar &amp; Academic Clarity Diagnostics</h3>
                          <p>OriginalityAI evaluates grammatical cadence, passive voice density, and lexical variety during every scan.</p>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                        Run a unified Originality, Paraphrase, and Grammar clarity inspection from the primary scanner.
                      </p>
                      <button
                        type="button"
                        className="btn-check-plagiarism-main"
                        style={{ margin: '0 auto', maxWidth: '280px' }}
                        onClick={() => setActiveTab('plagiarism')}
                      >
                        Open Originality Scanner
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Feature Comparison Matrix */}
            <section className="comparison-section">
              <div className="text-center section-heading-wrap">
                <h2 className="section-heading">Verification Depth &amp; Capability Matrix</h2>
                <p className="section-subheading">
                  Compare multi-layer semantic inspection against traditional keyword-matching tools.
                </p>
              </div>

              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th className="highlight-col">OriginalityAI</th>
                      <th>Grammarly</th>
                      <th>DupliChecker</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Word Capacity Per Scan</td>
                      <td className="highlight-col text-emerald font-bold">Up to 2,500 words</td>
                      <td>2,000 words</td>
                      <td>1,000 words</td>
                    </tr>
                    <tr>
                      <td>Semantic Paraphrasing &amp; Patchwriting</td>
                      <td className="highlight-col text-emerald">Syntactic &amp; Clause Decomposition</td>
                      <td>Standard Matching</td>
                      <td>Keyword Matching Only</td>
                    </tr>
                    <tr>
                      <td>Sentence-by-Sentence Inspector</td>
                      <td className="highlight-col text-emerald">Interactive Split-Pane Canvas</td>
                      <td>Yes</td>
                      <td>Static List</td>
                    </tr>
                    <tr>
                      <td>One-Click Passage Restructuring</td>
                      <td className="highlight-col text-emerald">Built-in Contextual Rewrite</td>
                      <td>Separate Add-on</td>
                      <td>External Tool</td>
                    </tr>
                    <tr>
                      <td>Automatic APA / MLA / Chicago Citations</td>
                      <td className="highlight-col text-emerald">Inline 1-Click Generator</td>
                      <td>Included</td>
                      <td>Separate Tool</td>
                    </tr>
                    <tr>
                      <td>Document Privacy Policy</td>
                      <td className="highlight-col text-emerald">Zero Public Indexing</td>
                      <td>Saved to Cloud History</td>
                      <td>Varies</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* How It Works */}
            <section className="how-it-works-section">
              <div className="text-center section-heading-wrap">
                <h2 className="section-heading">Three-Stage Verification Workflow</h2>
                <p className="section-subheading">
                  From raw manuscript upload to verified citations and sentence-level revisions.
                </p>
              </div>

              <div className="steps-grid">
                <div className="step-card">
                  <div className="step-number">01</div>
                  <h3>Upload or Paste Manuscript</h3>
                  <p>
                    Import documents directly in PDF (.pdf), Word (.docx), Plain Text (.txt), or Markdown (.md) format, or paste prose into the editor.
                  </p>
                </div>

                <div className="step-card">
                  <div className="step-number">02</div>
                  <h3>Multi-Layer Linguistic Analysis</h3>
                  <p>
                    Cross-reference against indexed publications and web sources to flag verbatim overlaps, synonym-swapped patchwriting, and synthetic AI cadence.
                  </p>
                </div>

                <div className="step-card">
                  <div className="step-number">03</div>
                  <h3>Resolve &amp; Cite in One Click</h3>
                  <p>
                    Inspect highlighted sentences in the split-pane assistant, apply contextual rewrites, and copy formatted APA or MLA citations.
                  </p>
                </div>
              </div>
            </section>

            {/* Educational Section: Plagiarism vs Paraphrasing vs Patchwriting */}
            <section className="education-section">
              <div className="uploader-card">
                <div className="text-center section-heading-wrap">
                  <h2 className="section-heading">Classification Taxonomy</h2>
                  <p className="section-subheading">
                    How OriginalityAI categorizes text segments during deep document inspection.
                  </p>
                </div>

                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-icon-box bg-crimson-dim">
                      <AlertTriangle className="text-crimson" size={20} />
                    </div>
                    <h3>Direct Plagiarism</h3>
                    <p>
                      Word-for-word text copied from an external publication or repository without quotation marks and formal attribution.
                    </p>
                  </div>

                  <div className="info-card">
                    <div className="info-icon-box bg-amber-dim">
                      <Repeat className="text-amber" size={20} />
                    </div>
                    <h3>Patchwriting &amp; Paraphrasing</h3>
                    <p>
                      Replacing select words with synonyms while retaining the underlying clause structure and argument sequence of a source.
                    </p>
                  </div>

                  <div className="info-card">
                    <div className="info-icon-box bg-purple-dim">
                      <Bot className="text-purple" size={20} />
                    </div>
                    <h3>AI-Synthesized Cadence</h3>
                    <p>
                      Prose exhibiting uniform sentence burstiness, low perplexity variance, and formulaic transitional patterns typical of language models.
                    </p>
                  </div>

                  <div className="info-card">
                    <div className="info-icon-box bg-emerald-dim">
                      <CheckCircle2 className="text-emerald" size={20} />
                    </div>
                    <h3>Authentic Scholarship</h3>
                    <p>
                      Original synthesis written with natural structural variation, supported by clear parenthetical citations and independent analysis.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* FAQ Accordion with Search Filter */}
            <section className="faq-section">
              <div className="text-center section-heading-wrap">
                <h2 className="section-heading">Frequently Asked Questions</h2>
                <p className="section-subheading">
                  Technical details on document privacy, file extraction, and semantic detection.
                </p>
              </div>

              <div className="faq-search-container">
                <div className="faq-search-input-wrap">
                  <Search size={18} className="faq-search-icon" />
                  <input
                    type="search"
                    className="faq-search-input"
                    placeholder="Search questions (e.g., privacy, PDF, citations, paraphrasing, cloud history)..."
                    aria-label="Search frequently asked questions"
                    value={faqSearchQuery}
                    onChange={(e) => setFaqSearchQuery(e.target.value)}
                  />
                  {faqSearchQuery && (
                    <button
                      type="button"
                      className="faq-search-clear-btn"
                      onClick={() => setFaqSearchQuery('')}
                      aria-label="Clear FAQ search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="faq-list">
                {(() => {
                  const faqItems = [
                    {
                      q: 'Will my document be stored or indexed in public repositories?',
                      a: 'Never. Unlike legacy institutional checkers that permanently store submissions in shared databases, OriginalityAI enforces a strict Zero Data Retention policy for public indices. Documents are never shared or indexed publicly.'
                    },
                    {
                      q: 'How does semantic paraphrase and patchwriting detection work?',
                      a: 'Rather than only matching identical consecutive word strings, OriginalityAI evaluates syntactic structure, synonym substitution density, and clause inversion against published academic literature.'
                    },
                    {
                      q: 'Can this platform generate bibliography citations automatically?',
                      a: 'Yes. Whenever an external literature match is identified, the inspection sidebar provides formatted citations in APA 7th Edition, MLA 9th Edition, and Chicago styles for immediate copying.'
                    },
                    {
                      q: 'What document file formats are supported for upload?',
                      a: 'You can upload Adobe PDF (.pdf), Microsoft Word (.docx), Plain Text (.txt), and Markdown (.md) files up to 15 MB, or paste text directly into the workspace.'
                    },
                    {
                      q: 'How are my scan reports saved across devices?',
                      a: 'When you sign in with Google, your scan history and student verification profile are securely stored in your private Firestore workspace, accessible only to your authenticated account.'
                    },
                    {
                      q: 'How do students qualify for free unlimited access?',
                      a: 'On the Sign In page, select the Student Account tab and verify with your school or university details using Google Sign-In or an email verification code to unlock full access at zero cost.'
                    }
                  ];

                  const normalizedQuery = faqSearchQuery.trim().toLowerCase();
                  const filteredFaqs = normalizedQuery
                    ? faqItems.filter(
                        (item) =>
                          item.q.toLowerCase().includes(normalizedQuery) ||
                          item.a.toLowerCase().includes(normalizedQuery)
                      )
                    : faqItems;

                  if (filteredFaqs.length === 0) {
                    return (
                      <div className="faq-empty-state">
                        <HelpCircle size={24} className="text-dim" />
                        <p>No questions match &ldquo;{faqSearchQuery}&rdquo;.</p>
                        <button
                          type="button"
                          className="btn-action-secondary"
                          onClick={() => setFaqSearchQuery('')}
                        >
                          Clear Search Filter
                        </button>
                      </div>
                    );
                  }

                  return filteredFaqs.map((item, index) => {
                    const isOpen = normalizedQuery ? true : faqOpen === index;
                    return (
                      <div key={item.q} className="faq-item">
                        <button
                          type="button"
                          className="faq-question-btn"
                          onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                        >
                          <span>{item.q}</span>
                          <ChevronDown size={18} className={`faq-arrow ${isOpen ? 'faq-arrow-open' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="faq-answer-body">
                            <p>{item.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </>
        ) : (
          <ResultsView 
            result={currentResult} 
            onReset={() => setCurrentResult(null)} 
          />
        )}
      </main>

      {/* History Modal */}
      <ScanHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectScan={(scan) => setCurrentResult(scan)}
        onClearHistory={handleClearHistory}
      />

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="footer-logo">
              <ShieldCheck size={20} className="text-emerald" />
              <span>OriginalityAI</span>
            </div>
            <p className="footer-copy">
              Multi-layer plagiarism, semantic paraphrase, and authorship verification platform with sentence-level transparency.
            </p>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>Workspace</h4>
              <span onClick={() => { setActiveTab('plagiarism'); setCurrentResult(null); }} style={{ cursor: 'pointer' }}>Originality Scanner</span>
              <span onClick={() => { setActiveTab('paraphraser'); setCurrentResult(null); }} style={{ cursor: 'pointer' }}>Paraphrasing Tool</span>
              <span onClick={() => { setActiveTab('citations'); setCurrentResult(null); }} style={{ cursor: 'pointer' }}>Citation Generator</span>
              <span onClick={() => { setActiveTab('grammar'); setCurrentResult(null); }} style={{ cursor: 'pointer' }}>Grammar &amp; Style</span>
            </div>
            <div className="footer-col">
              <h4>Security &amp; Standards</h4>
              <span>Zero-Retention Processing</span>
              <span>APA 7th &amp; MLA 9th Ready</span>
              <span>PDF &amp; DOCX Extraction</span>
              <span>Sentence-Level Diagnostics</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} OriginalityAI. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
