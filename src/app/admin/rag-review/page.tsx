'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface RAGCandidate {
  id: string;
  question: string;
  answer: string;
  is_approved: boolean | null;
  created_at: string;
  user_email: string;
}

export default function AdminRAGReviewPage() {
  const [candidates, setCandidates] = useState<RAGCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadCandidates();
  }, [filter]);

  const loadCandidates = async () => {
    try {
      const res = await fetch(`/api/admin/rag-candidates?filter=${filter}`);
      const data = await res.json();
      if (res.ok) {
        setCandidates(data.candidates || []);
      } else {
        toast.error(data.error || 'Failed to load candidates');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/rag-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (res.ok) {
        toast.success('Q&A approved and added to knowledge base');
        loadCandidates();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to approve');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/rag-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (res.ok) {
        toast.success('Q&A rejected');
        loadCandidates();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to reject');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/rag-candidates/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Q&A deleted');
        loadCandidates();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">RAG Knowledge Review</h1>
        <p className="text-slate-400">
          Review Q&A pairs from user searches. Approved answers will be added to the AI knowledge base.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className={filter === f
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {candidates.length > 0 ? (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <Card key={candidate.id} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Question */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-purple-400">QUESTION</span>
                        {candidate.is_approved === true && (
                          <Badge className="bg-green-600 text-xs">Approved</Badge>
                        )}
                        {candidate.is_approved === false && (
                          <Badge variant="outline" className="border-red-600 text-red-400 text-xs">Rejected</Badge>
                        )}
                      </div>
                      <p className="text-white font-medium">{candidate.question}</p>
                    </div>

                    {/* Answer Preview */}
                    <div className="mb-3">
                      <span className="text-xs font-medium text-blue-400">AI ANSWER</span>
                      <p className="text-slate-300 text-sm mt-1 line-clamp-4">
                        {stripHtml(candidate.answer)}
                      </p>
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Asked by: {candidate.user_email}</span>
                      <span>{formatDate(candidate.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {candidate.is_approved === null && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(candidate.id)}
                          disabled={processing === candidate.id}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {processing === candidate.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <>
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(candidate.id)}
                          disabled={processing === candidate.id}
                          className="border-red-600 text-red-400 hover:bg-red-900/20"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(candidate.id)}
                      disabled={processing === candidate.id}
                      className="text-slate-400 hover:text-red-400 hover:bg-slate-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <svg className="w-12 h-12 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-slate-400">
              {filter === 'pending'
                ? 'No pending Q&A pairs to review'
                : `No ${filter} Q&A pairs found`
              }
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Q&A pairs are collected from user searches automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
