'use client';

import React from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { 
  ShieldCheck, 
  LogOut, 
  History, 
  BookOpen, 
  Repeat, 
  CheckCheck,
  FileCheck2,
  ArrowUpRight
} from 'lucide-react';

interface NavbarProps {
  onOpenHistory?: () => void;
  historyCount?: number;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export default function Navbar({ 
  onOpenHistory, 
  historyCount = 0,
  activeTab = 'plagiarism',
  onSelectTab
}: NavbarProps) {
  const { data: session, status } = useSession();

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Zone 1: Clean single-line Brand Wordmark */}
        <div
          className="brand"
          onClick={() => onSelectTab && onSelectTab('plagiarism')}
          style={{ cursor: 'pointer' }}
        >
          <div className="brand-logo">
            <ShieldCheck className="brand-icon" size={20} />
          </div>
          <span className="brand-title">
            Originality<span className="brand-gradient">AI</span>
          </span>
        </div>

        {/* Zone 2: Clean Single-Line Navigation Links */}
        <nav className="navbar-nav-tools" aria-label="Workspace tools">
          <button
            type="button"
            className={`nav-tool-btn ${activeTab === 'plagiarism' ? 'nav-tool-active' : ''}`}
            onClick={() => onSelectTab && onSelectTab('plagiarism')}
          >
            <FileCheck2 size={15} />
            <span>Originality Scanner</span>
          </button>

          <button
            type="button"
            className={`nav-tool-btn ${activeTab === 'paraphraser' ? 'nav-tool-active' : ''}`}
            onClick={() => onSelectTab && onSelectTab('paraphraser')}
          >
            <Repeat size={15} />
            <span>Paraphraser</span>
          </button>

          <button
            type="button"
            className={`nav-tool-btn ${activeTab === 'citations' ? 'nav-tool-active' : ''}`}
            onClick={() => onSelectTab && onSelectTab('citations')}
          >
            <BookOpen size={15} />
            <span>Citations</span>
          </button>

          <button
            type="button"
            className={`nav-tool-btn ${activeTab === 'grammar' ? 'nav-tool-active' : ''}`}
            onClick={() => onSelectTab && onSelectTab('grammar')}
          >
            <CheckCheck size={15} />
            <span>Grammar & Style</span>
          </button>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="navbar-actions">
          {historyCount > 0 && (
            <button 
              type="button" 
              className="btn-history"
              onClick={onOpenHistory}
              title="Recent Scans"
            >
              <History size={15} />
              <span>History</span>
              <span className="history-count-num">{historyCount}</span>
            </button>
          )}

          {status === 'loading' ? (
            <div className="auth-skeleton" />
          ) : session?.user ? (
            <div className="user-profile">
              <div className="user-avatar-fallback">
                {session.user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="user-details">
                <span className="user-name">{session.user.name || 'Account'}</span>
                <span className="user-email">{session.user.email}</span>
              </div>
              <button 
                type="button" 
                onClick={() => signOut()}
                className="btn-signout"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link 
              href="/login"
              className="btn-email-signin"
            >
              <span>Sign In</span>
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
