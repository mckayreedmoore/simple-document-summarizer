import React from 'react';
import type { File } from '../types/file';

interface FileListProps {
  files: File[];
}

const FileList: React.FC<FileListProps> = ({ files }) => (
  <div className='flex h-full flex-col gap-2 overflow-y-auto rounded-bl-2xl border-l border-t border-zinc-300 border-zinc-700 bg-zinc-800/70 px-3 py-3 shadow-xl backdrop-blur-md'>
    {files.length === 0 ? (
      <>
        <h2 className='text-xs font-semibold uppercase tracking-wide text-zinc-100'>Files</h2>
        <div className='text-zinc-400'>No files uploaded.</div>
      </>
    ) : (
      <ul className='grid w-full grid-cols-3 gap-x-3 gap-y-3'>
        {files.map((file) => (
          <li
            key={file.id}
            className='group relative flex min-w-0 items-center rounded-xl border border-zinc-600 bg-zinc-700/80 px-2 py-3 shadow-md transition-all duration-150'
            style={{ minHeight: 44 }}
          >
            <span
              className='relative block min-w-0 flex-1 truncate pr-2 text-sm text-zinc-100'
            >
              {file.fileName}
              {file.uploading && (
                <span
                  className='absolute inset-0 flex items-center justify-center bg-black/40'
                  style={{ borderRadius: 8 }}
                >
                  <svg width='16' height='16' viewBox='0 0 16 16' style={{ animation: 'spin 1s linear infinite' }}>
                    <circle
                      cx='8'
                      cy='8'
                      r='6'
                      stroke='#3b82f6'
                      strokeWidth='2'
                      fill='none'
                      strokeDasharray='28'
                      strokeDashoffset='10'
                      strokeLinecap='round'
                    />
                  </svg>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default FileList;
