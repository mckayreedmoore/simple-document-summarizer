import React, { useRef, useState, useEffect } from 'react';
import ChatInput from './ChatInput';
import LoadingSpinner from './LoadingSpinner';
import DocumentList from './DocumentList';
import type { DocumentListHandle } from './DocumentList';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

const BOTTOM_BAR_HEIGHT = 90;

const ChatArea: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const documentListRef = useRef<DocumentListHandle>(null);

  useEffect(() => {
    // Fetch conversation on mount
    fetch('/api/chat/get')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id: number; sender: 'user' | 'bot'; text: string }) => ({
              id: m.id + '-' + m.sender,
              sender: m.sender,
              text: m.text,
            }))
          );
        }
      });
  }, []);

  // Scroll to bottom on initial load only
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
    // eslint-disable-next-line
  }, [messages.length === 0]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const addMessage = React.useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now() + '-user',
      sender: 'user',
      text: input,
    };
    setLoading(true);
    addMessage(userMsg);
    setInput('');
    try {
      const history = [...messages, userMsg]
        .filter(m => m.sender === 'user' || m.sender === 'bot')
        .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
      const res = await fetch('/api/chat/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, history }),
      });
      const data = await res.json();
      addMessage({
        id: Date.now() + '-bot',
        sender: 'bot',
        text: data.response || 'No response',
      });
    } catch (err) {
      let errorMsg = 'Error';
      if (err instanceof Error) {
        errorMsg = err.message;
      }
      addMessage({
        id: Date.now() + '-bot-error',
        sender: 'bot',
        text: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = React.useCallback(async (files: FileList) => {
    if (!files.length) return;
    const file = files[0];
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/chat/upload-file', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      addMessage({
        id: Date.now() + '-bot-file',
        sender: 'bot',
        text: data.success
          ? `File "${file.name}" uploaded and processed successfully.`
          : `Failed to process file "${file.name}".`,
      });
      if (data.success) {
        documentListRef.current?.refresh();
      }
    } catch {
      addMessage({
        id: Date.now() + '-bot-file-error',
        sender: 'bot',
        text: `File upload failed for "${file.name}".`,
      });
    } finally {
      setLoading(false);
    }
  }, [addMessage]);

  const handleClearConversation = async () => {
    setLoading(true);
    await fetch('/api/chat/clear', { method: 'POST' });
    setMessages([]);
    setLoading(false);
  };

  // Drag and drop handlers for the whole chat area
  useEffect(() => {
    const chatArea = chatAreaRef.current;
    if (!chatArea) return;
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      if (e.target === chatArea) setDragActive(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    };
    chatArea.addEventListener('dragover', handleDragOver);
    chatArea.addEventListener('dragleave', handleDragLeave);
    chatArea.addEventListener('drop', handleDrop);
    return () => {
      chatArea.removeEventListener('dragover', handleDragOver);
      chatArea.removeEventListener('dragleave', handleDragLeave);
      chatArea.removeEventListener('drop', handleDrop);
    };
  }, [handleFileUpload]);

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-zinc-900">
      <div ref={chatAreaRef} className={"flex flex-col bg-zinc-900 rounded-2xl shadow-lg border border-zinc-300 w-[75vw] h-[75vh] mx-4 md:mx-8 lg:mx-16 overflow-hidden relative " + (dragActive ? 'ring-4 ring-blue-400 ring-opacity-60' : '')}>
        <div className="flex-1 overflow-y-auto p-8 flex flex-col min-h-0 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent scrollbar-corner-transparent">
          <div className="flex-1 flex flex-col w-full min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent scrollbar-corner-transparent pr-4">
            <div className="flex justify-end mb-2">
            </div>
            {messages.length === 0 && (
              <div className="text-zinc-500 text-center mt-10 text-lg select-none">
                Chat with me
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`my-2 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-xl px-5 py-3 max-w-xl whitespace-pre-line shadow text-base break-words ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md ml-auto mr-1'
                      : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-md ml-1 mr-auto'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-zinc-500 text-center mt-2">Thinking...</div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="flex flex-row items-end" style={{height: BOTTOM_BAR_HEIGHT}}>
          <div className="w-[40%] min-w-[260px] max-w-[420px] h-full ">
            <DocumentList ref={documentListRef} height={BOTTOM_BAR_HEIGHT} />
          </div>
          <div className="flex-1 h-full">
            <div className="border-t border-zinc-300 bg-zinc-900 p-4 h-full flex items-center">
              <div className="w-full h-full flex items-center">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  disabled={loading}
                  onFileUpload={handleFileUpload}
                  dragActive={dragActive}
                  setDragActive={setDragActive}
                  className="w-full h-full"
                  onClearConversation={handleClearConversation}
                  clearLoading={loading}
                />
              </div>
            </div>
          </div>
        </div>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 rounded-xl">
            <LoadingSpinner />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatArea;
