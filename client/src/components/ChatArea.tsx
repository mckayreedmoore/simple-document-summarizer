import React, { useRef, useState, useEffect } from 'react';
import ChatInput from './ChatInput';
import DocumentList from './DocumentList';
import type { DocumentListHandle } from './DocumentList';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

const BOTTOM_BAR_HEIGHT = 75;

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
    fetch('/api/conversation/get')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id: number; sender: 'user' | 'bot'; text: string }) => ({
              id: m.id + '-' + m.sender,
              sender: m.sender,
              text: m.text,
            }))
          );
        }
        // Optionally, you could update DocumentList here if you want to pass documents directly
        // if (Array.isArray(data.documents)) {
        //   documentListRef.current?.setDocuments(data.documents);
        // }
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

  // Streaming chat handler
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
      // Only send previous messages as history, not the current prompt
      const history = messages
        .filter((m) => m.sender === 'user' || m.sender === 'bot')
        .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
      const res = await fetch('/api/conversation/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, history }),
      });
      if (!res.body) throw new Error('No response body');
      let botMsg: Message = {
        id: Date.now() + '-bot',
        sender: 'bot',
        text: '',
      };
      addMessage(botMsg);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\n\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                botMsg = {
                  ...botMsg,
                  text: (botMsg.text || '') + data.token,
                };
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.id === botMsg.id) {
                    return [...prev.slice(0, -1), botMsg];
                  } else {
                    return [...prev, botMsg];
                  }
                });
              }
              if (data.done) {
                setLoading(false);
              }
              if (data.error) {
                botMsg = {
                  ...botMsg,
                  text: data.error,
                };
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last && last.id === botMsg.id) {
                    return [...prev.slice(0, -1), botMsg];
                  } else {
                    return [...prev, botMsg];
                  }
                });
                setLoading(false);
              }
            }
          }
        }
      }
      setLoading(false);
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
      setLoading(false);
    }
  };

  const handleFileUpload = React.useCallback(
    async (files: FileList) => {
      if (!files.length) return;
      const file = files[0];
      const tempId = 'uploading-' + Date.now() + '-' + Math.random();
      documentListRef.current?.addUploading(tempId, file.name);
      // Do not block UI
      (async () => {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const response = await fetch('/api/conversation/upload-file', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (data.success) {
            // Refresh will replace the placeholder with the real doc
            documentListRef.current?.refresh();
          } else {
            documentListRef.current?.removeUploading(tempId);
            addMessage({
              id: Date.now() + '-bot-file',
              sender: 'bot',
              text: `Failed to process file "${file.name}".`,
            });
          }
        } catch {
          documentListRef.current?.removeUploading(tempId);
          addMessage({
            id: Date.now() + '-bot-file-error',
            sender: 'bot',
            text: `File upload failed for "${file.name}".`,
          });
        }
      })();
    },
    [addMessage]
  );

  const handleClearConversation = async () => {
    setLoading(true);
    await fetch('/api/conversation/clear', { method: 'POST' });
    setMessages([]);
    documentListRef.current?.refresh();
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
    <div className='flex min-h-screen w-full items-center justify-center bg-zinc-900'>
      <div
        ref={chatAreaRef}
        className={
          'relative mx-4 flex h-[90vh] w-[70vw] flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-900 shadow-lg md:mx-8 lg:mx-16 ' +
          (dragActive ? 'ring-4 ring-blue-400 ring-opacity-60' : '')
        }
      >
        <div className='scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent scrollbar-corner-transparent flex min-h-0 flex-1 flex-col overflow-y-auto p-8'>
          <div className='scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent scrollbar-corner-transparent flex min-h-0 w-full flex-1 flex-col overflow-y-auto pr-4'>
            <div className='mb-2 flex justify-end'></div>
            {messages.length === 0 && (
              <div className='mt-10 select-none text-center text-lg text-zinc-500'>
                Chat with me
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`my-2 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl whitespace-pre-line break-words rounded-xl px-5 py-3 text-left text-base shadow ${
                    msg.sender === 'user'
                      ? 'ml-auto mr-1 rounded-br-md bg-blue-600 text-white'
                      : 'ml-1 mr-auto rounded-bl-md border border-zinc-700 bg-zinc-800 text-zinc-100'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className='flex flex-row items-end' style={{ height: BOTTOM_BAR_HEIGHT }}>
          <div className='h-full w-[40%] min-w-[260px] max-w-[420px]'>
            <DocumentList ref={documentListRef} height={BOTTOM_BAR_HEIGHT} />
          </div>
          <div className='h-full flex-1'>
            <div className='flex h-full items-center border-t border-zinc-300 bg-zinc-900 p-4'>
              <div className='flex h-full w-full items-center'>
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  disabled={loading}
                  onFileUpload={handleFileUpload}
                  dragActive={dragActive}
                  setDragActive={setDragActive}
                  className='h-full w-full'
                  onClearConversation={handleClearConversation}
                  clearLoading={loading}
                />
              </div>
            </div>
          </div>
        </div>
        {/* Remove or comment out the loading overlay so chat is visible while streaming */}
        {/*
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 rounded-xl">
            <LoadingSpinner />
          </div>
        )}
        */}
      </div>
    </div>
  );
};

export default ChatArea;
