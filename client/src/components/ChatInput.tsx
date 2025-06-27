import React, { useRef } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  onFileUpload: (files: FileList) => void;
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
  className?: string;
  onClearConversation?: () => void;
  clearLoading?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  onFileUpload,
  dragActive,
  setDragActive,
  className,
  onClearConversation,
  clearLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFileUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) {
      onFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  return (
    <div
      className={`relative flex w-full items-center gap-2 ${className || ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ height: '100%' }}
    >
      <input
        type='text'
        className='h-full flex-1 rounded-lg border border-zinc-400 bg-zinc-800 px-4 py-2 text-base text-zinc-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500'
        placeholder='Type your message...'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{ height: '100%' }}
      />
      <div className='flex h-full items-center gap-2'>
        <button
          className='h-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50'
          onClick={onSend}
          disabled={disabled}
          style={{ height: '100%' }}
        >
          Send
        </button>
        <button
          className='h-full rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50'
          onClick={onClearConversation}
          disabled={disabled || clearLoading}
          style={{ height: '100%' }}
          title='Clear all chat messages'
        >
          Clear
        </button>
        <input
          type='file'
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className='h-full rounded-lg bg-zinc-700 px-4 py-2 font-semibold text-zinc-200 transition hover:bg-zinc-600 disabled:opacity-50'
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          style={{ height: '100%' }}
          title='Upload file'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth={1.5}
            stroke='currentColor'
            className='mx-auto h-5 w-5'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M12 16V4m0 0l-4 4m4-4l4 4M4 20h16'
            />
          </svg>
        </button>
      </div>
      {dragActive && (
        <div className='pointer-events-none absolute inset-0 z-10 rounded-lg bg-blue-400 bg-opacity-20' />
      )}
    </div>
  );
};

export default ChatInput;
