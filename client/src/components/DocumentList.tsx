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

const DocumentList = forwardRef<DocumentListHandle, DocumentListProps>(
  ({ onSelect, className, height }, ref) => {
    const [documents, setDocuments] = useState<
      { id: number | string; fileName: string; uploading?: boolean }[]
    >([]);
    const [loading, setLoading] = useState(true);

    const addUploading = React.useCallback((tempId: string, fileName: string) => {
      setDocuments((docs) => [{ id: tempId, fileName, uploading: true }, ...docs]);
    }, []);

    const markUploaded = React.useCallback(
      (tempId: string, newId: number, newName: string) => {
        setDocuments((docs) =>
          docs.map((d) => (d.id === tempId ? { id: newId, fileName: newName } : d))
        );
      },
      []
    );

    const removeUploading = React.useCallback((tempId: string) => {
      setDocuments((docs) => docs.filter((d) => d.id !== tempId));
    }, []);

    const fetchDocuments = React.useCallback(() => {
      setLoading(true);
      fetch('/api/conversation/get')
        .then((res) => res.json())
        .then((data) => {
          setDocuments((docs) => {
            const realDocs = (data.files || []).map(
              (doc: { id: number; fileName: string }) => doc
            );
            const uploading = docs.filter(
              (d) =>
                d.uploading &&
                !realDocs.some(
                  (r: { id: number | string; fileName: string }) =>
                    r.fileName === d.fileName || r.id === d.id
                )
            );
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
      return { ...result, fileName: result.fileName };
    }, []);

    // Drag-and-drop handler for single file upload
    const handleDrop = React.useCallback(
      async (e: React.DragEvent<HTMLDivElement>) => {
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
      },
      [addUploading, uploadFile, markUploaded, removeUploading]
    );

    const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    useImperativeHandle(
      ref,
      () => ({ refresh: fetchDocuments, addUploading, markUploaded, removeUploading }),
      [fetchDocuments, addUploading, markUploaded, removeUploading]
    );

    useEffect(() => {
      fetchDocuments();
    }, [fetchDocuments]);

    const shouldCenter = loading || documents.length === 0;

    return (
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`flex h-full flex-col gap-2 overflow-y-auto rounded-bl-2xl border-l border-t border-zinc-300 border-zinc-700 bg-zinc-800/70 px-3 py-3 shadow-xl backdrop-blur-md ${className || ''}`}
        style={{ minHeight: height, height: height, maxHeight: height }}
      >
        <div className={shouldCenter ? 'flex flex-1 flex-col justify-center' : ''}>
          {(!documents.length || loading) && (
            <h2 className='mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-100'>
              Documents
            </h2>
          )}
          {loading ? (
            <div className='text-zinc-400'>Loading...</div>
          ) : documents.length === 0 ? (
            <div className='text-zinc-400'>No documents uploaded.</div>
          ) : (
            <ul className='grid w-full grid-cols-3 gap-4'>
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className='group relative flex min-w-0 items-center rounded-xl border border-zinc-600 bg-zinc-700/80 px-2 py-3 shadow-md transition-all duration-150'
                  style={{ minHeight: 44, opacity: doc.uploading ? 0.7 : 1 }}
                >
                  <span
                    className='relative block min-w-0 flex-1 truncate pr-2 text-sm text-zinc-100'
                    title={doc.fileName}
                    onClick={() => onSelect?.(doc.fileName)}
                    style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  >
                    {doc.fileName}
                    {doc.uploading && (
                      <span
                        className='absolute inset-0 flex items-center justify-center bg-black/40'
                        style={{ borderRadius: 8 }}
                      >
                        <svg
                          className='animate-spin'
                          width='22'
                          height='22'
                          viewBox='0 0 22 22'
                        >
                          <circle
                            cx='11'
                            cy='11'
                            r='9'
                            stroke='#fff'
                            strokeWidth='3'
                            fill='none'
                            opacity='0.2'
                          />
                          <path
                            d='M20 11a9 9 0 1 1-9-9'
                            stroke='#fff'
                            strokeWidth='3'
                            fill='none'
                            strokeLinecap='round'
                          />
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
  }
);

export default DocumentList;
