import React, { useRef } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  onFileUpload: (files: FileList) => void;
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  onFileUpload,
  dragActive,
  setDragActive,
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

  return (
    <div
      className={`flex items-center gap-2 p-0 border-none bg-zinc-900 relative rounded-b-xl ${dragActive ? 'ring-2 ring-blue-400' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
      onDrop={handleDrop}
    >
      <input
        className="flex-1 border-none rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 bg-zinc-800 text-zinc-100 placeholder-zinc-400 shadow-sm transition-all duration-200"
        type="text"
        placeholder="Type your message..."
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{ minHeight: '48px' }}
      />
      <button
        className="ml-2 flex items-center gap-1 bg-zinc-700 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        onClick={() => fileInputRef.current?.click()}
        title="Upload file"
        type="button"
        disabled={disabled}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V4.75m0 11.75l-3.25-3.25m3.25 3.25l3.25-3.25M4.75 19.25h14.5" />
        </svg>
        <span className="hidden sm:inline">Upload</span>
        <input
          type="file"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </button>
      <button
        className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        type="button"
      >
        Send
      </button>
    </div>
  );
};

export default ChatInput;
