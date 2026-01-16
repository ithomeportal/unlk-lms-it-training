'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SearchResult {
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  content_snippet: string;
  relevance_score: number;
}

interface SearchInterfaceProps {
  initialQuery?: string;
}

export function SearchInterface({ initialQuery }: SearchInterfaceProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<string>('');
  const [searched, setSearched] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setStreaming(false);
    setSearched(true);
    setResults([]);
    setAnswer('');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, stream: true }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error('Search failed');
      }

      const contentType = res.headers.get('content-type');

      // Handle streaming response
      if (contentType?.includes('text/event-stream')) {
        setLoading(false);
        setStreaming(true);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error('No reader available');

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'results') {
                  setResults(data.results || []);
                } else if (data.type === 'answer_chunk') {
                  setAnswer(prev => prev + data.text);
                } else if (data.type === 'done') {
                  setStreaming(false);
                } else if (data.type === 'error') {
                  setAnswer('<p class="mb-3 text-red-400">Sorry, there was an error generating the answer.</p>');
                  setStreaming(false);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } else {
        // Handle non-streaming response (fallback)
        const data = await res.json();
        setResults(data.results || []);
        setAnswer(data.answer || '');
        setLoading(false);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return; // Request was cancelled
      }
      console.error('Search error:', error);
      setAnswer('<p class="mb-3 text-red-400">Network error. Please try again.</p>');
      setLoading(false);
      setStreaming(false);
    }
  };

  // Auto-search if initialQuery is provided
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initialQuery]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSearch(query);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">AI-Powered Knowledge Search</h1>
        <p className="text-slate-400">
          Ask any question about your training courses. Our AI will find the most relevant content.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question... e.g., 'How do I create a dashboard?' or 'What is data modeling?'"
              className="pl-12 h-14 bg-slate-800/50 border-slate-600 text-white text-lg placeholder:text-slate-500"
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !query.trim()}
            className="h-14 px-8 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Searching...
              </div>
            ) : (
              'Search'
            )}
          </Button>
        </div>
      </form>

      {/* AI Answer */}
      {(answer || streaming) && (
        <Card className="mb-6 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border-purple-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-purple-300 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Answer
              {streaming && (
                <span className="ml-2 flex items-center gap-1 text-sm text-purple-400">
                  <span className="animate-pulse">●</span>
                  Generating...
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-white leading-relaxed prose prose-invert prose-purple max-w-none"
              dangerouslySetInnerHTML={{ __html: answer || '<p class="text-slate-400">Thinking...</p>' }}
            />
            {streaming && !answer && (
              <div className="flex items-center gap-2 text-slate-400">
                <div className="animate-pulse">●</div>
                <div className="animate-pulse delay-100">●</div>
                <div className="animate-pulse delay-200">●</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {searched && (
        <div>
          {results.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-4">
                Related Lessons ({results.length})
              </h2>
              <div className="space-y-3">
                {results.map((result) => (
                  <Link key={result.lesson_id} href={`/courses/${result.course_slug}`}>
                    <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                                {result.course_title}
                              </Badge>
                            </div>
                            <h3 className="font-medium text-white mb-1">{result.lesson_title}</h3>
                            {result.content_snippet && (
                              <p className="text-sm text-slate-400 line-clamp-2">
                                {result.content_snippet}
                              </p>
                            )}
                          </div>
                          <svg className="w-5 h-5 text-slate-400 ml-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          ) : !loading && !streaming && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-8 text-center">
                <p className="text-slate-400">No specific lessons found for your query.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Example Queries */}
      {!searched && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Try searching for:</h3>
          <div className="flex flex-wrap gap-2">
            {[
              'How do I create visualizations?',
              'Data loading best practices',
              'What is a DOT number?',
              'Freight broker terminology',
              'Dashboard customization',
            ].map((example) => (
              <button
                key={example}
                onClick={() => {
                  setQuery(example);
                }}
                className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
