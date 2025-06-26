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
      className={`relative flex items-center gap-2 w-full ${className || ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ height: '100%' }}
    >
      <input
        type="text"
        className="flex-1 rounded-lg border border-zinc-400 bg-zinc-800 text-zinc-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-base h-full"
        placeholder="Type your message..."
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{ height: '100%' }}
      />
      <div className="flex items-center gap-2 h-full">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 h-full"
          onClick={onSend}
          disabled={disabled}
          style={{ height: '100%' }}
        >
          Send
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 h-full"
          onClick={onClearConversation}
          disabled={disabled || clearLoading}
          style={{ height: '100%' }}
          title="Clear all chat messages"
        >
          Clear
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 h-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          style={{ height: '100%' }}
          title="Upload file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mx-auto">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
          </svg>
        </button>
      </div>
      {dragActive && (
        <div className="absolute inset-0 bg-blue-400 bg-opacity-20 rounded-lg pointer-events-none z-10" />
      )}
    </div>
  );
};

export default ChatInput;
