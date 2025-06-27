import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';

export interface DocumentListHandle {
  refresh: () => void;
  addUploading: (tempId: string, fileName: string) => void;
  markUploaded: (tempId: string, newId: number, newName: string) => void;
  removeUploading: (tempId: string) => void;
}

interface DocumentListProps {
  onSelect?: (fileName: string) => void;
  className?: string;
  height?: number;
}

const DocumentList = forwardRef<DocumentListHandle, DocumentListProps>(({ onSelect, className, height }, ref) => {
  const [documents, setDocuments] = useState<{ id: number|string, fileName: string, uploading?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  const addUploading = React.useCallback((tempId: string, fileName: string) => {
    setDocuments(docs => [{ id: tempId, fileName, uploading: true }, ...docs]);
  }, []);

  const markUploaded = React.useCallback((tempId: string, newId: number, newName: string) => {
    setDocuments(docs => docs.map(d => d.id === tempId ? { id: newId, fileName: newName } : d));
  }, []);

  const removeUploading = React.useCallback((tempId: string) => {
    setDocuments(docs => docs.filter(d => d.id !== tempId));
  }, []);

  const fetchDocuments = React.useCallback(() => {
    setLoading(true);
    fetch('/api/documents/list')
      .then(res => res.json())
      .then(data => {
        setDocuments(docs => {
          const realDocs = (data.documents || []).map((doc: { id: number; fileName?: string; file_name?: string }) => ({ ...doc, fileName: doc.fileName ?? doc.file_name }));
          const uploading = docs.filter(d => d.uploading && !realDocs.some((r: { id: number|string; fileName: string }) => r.fileName === d.fileName || r.id === d.id));
          return [...uploading, ...realDocs];
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Upload a single file to the backend
  const uploadFile = React.useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    console.log('Uploading file:', file.name);
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      console.error('Upload failed for', file.name);
      throw new Error('Upload failed');
    }
    const result = await response.json();
    return { ...result, fileName: result.fileName ?? result.file_name };
  }, []);

  // Drag-and-drop handler for single file upload
  const handleDrop = React.useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const tempId = `uploading-${file.name}-${Date.now()}-${Math.random()}`;
    addUploading(tempId, file.name);
    try {
      const result = await uploadFile(file);
      markUploaded(tempId, result.id, result.fileName);
    } catch {
      removeUploading(tempId);
    }
  }, [addUploading, uploadFile, markUploaded, removeUploading]);

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useImperativeHandle(ref, () => ({ refresh: fetchDocuments, addUploading, markUploaded, removeUploading }), [fetchDocuments, addUploading, markUploaded, removeUploading]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const shouldCenter = loading || documents.length === 0;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`h-full bg-zinc-800/70 border-l border-zinc-700 border-t border-zinc-300 px-3 py-3 flex flex-col gap-2 overflow-y-auto rounded-bl-2xl shadow-xl backdrop-blur-md ${className || ''}`}
      style={{ minHeight: height, height: height, maxHeight: height }}
    >
      <div className={shouldCenter ? 'flex-1 flex flex-col justify-center' : ''}>
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
                key={doc.id}
                className="relative flex items-center bg-zinc-700/80 rounded-xl px-2 py-3 group min-w-0 shadow-md border border-zinc-600 transition-all duration-150"
                style={{ minHeight: 44, opacity: doc.uploading ? 0.7 : 1 }}
              >
                <span
                  className="flex-1 text-zinc-100 truncate pr-2 block min-w-0 text-sm relative"
                  title={doc.fileName}
                  onClick={() => onSelect?.(doc.fileName)}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                >
                  {doc.fileName}
                  {doc.uploading && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40" style={{ borderRadius: 8 }}>
                      <svg className="animate-spin" width="22" height="22" viewBox="0 0 22 22">
                        <circle cx="11" cy="11" r="9" stroke="#fff" strokeWidth="3" fill="none" opacity="0.2" />
                        <path d="M20 11a9 9 0 1 1-9-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

export default DocumentList;
