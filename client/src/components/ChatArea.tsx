import React, { useRef, useState, useEffect } from 'react';
import ChatInput from './ChatInput';
import LoadingSpinner from './LoadingSpinner';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

const ChatArea: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);

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

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return;
    const file = files[0];
    setLoading(true);
    addMessage({
      id: Date.now() + '-user-file',
      sender: 'user',
      text: `Uploading file: ${file.name}`,
    });
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
    } catch {
      addMessage({
        id: Date.now() + '-bot-file-error',
        sender: 'bot',
        text: `File upload failed for "${file.name}".`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-zinc-900">
      <div className="flex flex-col bg-zinc-900 rounded-2xl shadow-lg border border-zinc-300 w-3/4 max-w-lg min-h-[500px] min-w-[350px] mx-4 md:mx-8 lg:mx-16 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">
          <div className="flex-1 flex flex-col w-full">
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
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-md'
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
        <div className="border-t border-zinc-300 bg-zinc-900 p-4">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={loading}
            onFileUpload={handleFileUpload}
            dragActive={dragActive}
            setDragActive={setDragActive}
          />
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
