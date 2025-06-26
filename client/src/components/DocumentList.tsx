import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';

export interface DocumentListHandle {
  refresh: () => void;
}

interface DocumentListProps {
  onSelect?: (fileName: string) => void;
  className?: string;
  height?: number;
}

const DocumentList = forwardRef<DocumentListHandle, DocumentListProps>(({ onSelect, className, height }, ref) => {
  const [documents, setDocuments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = () => {
    setLoading(true);
    fetch('/api/documents/list')
      .then(res => res.json())
      .then(data => {
        setDocuments(data.documents?.map((d: { file_name: string }) => d.file_name) || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useImperativeHandle(ref, () => ({ refresh: fetchDocuments }), []);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleRemove = async (fileName: string) => {
    if (!window.confirm(`Remove document "${fileName}"?`)) return;
    await fetch('/api/documents/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    fetchDocuments();
  };

  return (
    <div
      className={`h-full bg-zinc-800/70 border-l border-zinc-700 border-t border-zinc-300 px-3 py-3 flex flex-col gap-2 overflow-y-auto rounded-bl-2xl shadow-xl backdrop-blur-md ${className || ''}`}
      style={{ minHeight: height, height: height, maxHeight: height }}
    >
      {(!documents.length || loading) && (
        <h2 className="text-xs font-semibold text-zinc-100 mb-2 tracking-wide uppercase">Documents</h2>
      )}
      {loading ? (
        <div className="text-zinc-400">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-zinc-400">No documents uploaded.</div>
      ) : (
        <ul className="grid grid-cols-3 gap-4 w-full">
          {documents.map((doc) => (
            <li
              key={doc}
              className="relative flex items-center bg-zinc-700/80 rounded-xl px-2 py-3 group min-w-0 shadow-md border border-zinc-600 transition-all duration-150"
              style={{ minHeight: 44 }}
            >
              <span
                className="flex-1 text-zinc-100 truncate pr-2 block min-w-0 text-sm"
                title={doc}
                onClick={() => onSelect?.(doc)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                {doc}
              </span>
              <button
                className="absolute -top-2 -right-2 flex items-center justify-center z-20 shadow-lg border-2 border-white cursor-pointer transition"
                style={{ background: '#ef4444', color: 'white', width: 16, height: 20, fontWeight: 'bold', fontSize: '1.05rem', lineHeight: 1, opacity: 0.97, borderRadius: 8, padding: 0 }}
                title="Remove document"
                onClick={e => { e.stopPropagation(); handleRemove(doc); }}
              >
                <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: 0}}>
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default DocumentList;
