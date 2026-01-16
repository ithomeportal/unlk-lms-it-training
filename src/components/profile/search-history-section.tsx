'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SearchHistoryItem {
  id: string;
  query: string;
  ai_answer: string;
  result_count: number;
  searched_at: string;
}

interface SearchHistorySectionProps {
  initialHistory: SearchHistoryItem[];
}

export function SearchHistorySection({ initialHistory }: SearchHistorySectionProps) {
  const [history, setHistory] = useState(initialHistory);
  const [isClearing, setIsClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/search-history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(history.filter(item => item.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all search history?')) return;

    setIsClearing(true);
    try {
      const res = await fetch('/api/search-history', { method: 'DELETE' });
      if (res.ok) {
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search History
            </CardTitle>
            <CardDescription className="text-slate-400">
              Your past AI-powered searches
            </CardDescription>
          </div>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={isClearing}
              className="border-red-700 text-red-400 hover:bg-red-900/30 hover:text-red-300"
            >
              {isClearing ? 'Clearing...' : 'Clear All'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {history.length > 0 ? (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white mb-1">
                      &ldquo;{item.query}&rdquo;
                    </p>
                    {item.ai_answer && expandedId !== item.id && (
                      <p className="text-sm text-slate-400 line-clamp-2 mb-2">
                        {stripHtml(item.ai_answer).substring(0, 150)}...
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{item.result_count} results</span>
                      <span>•</span>
                      <span>{formatDate(item.searched_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.ai_answer && (
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-600/50 rounded transition-colors"
                        title={expandedId === item.id ? "Collapse answer" : "View full answer"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {expandedId === item.id ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          )}
                        </svg>
                      </button>
                    )}
                    <Link
                      href={`/search?q=${encodeURIComponent(item.query)}`}
                      className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-600/50 rounded transition-colors"
                      title="Search again"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-600/50 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded AI Answer */}
                {expandedId === item.id && item.ai_answer && (
                  <div className="mt-4 pt-4 border-t border-slate-600/50">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span className="text-sm font-medium text-purple-300">AI Answer</span>
                    </div>
                    <div
                      className="text-slate-300 prose prose-invert prose-purple prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: item.ai_answer }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-slate-400 mb-2">No search history yet</p>
            <Link href="/search" className="text-purple-400 hover:text-purple-300 text-sm">
              Try AI-powered search →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
