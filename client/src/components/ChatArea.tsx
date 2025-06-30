import { useRef, useState, useEffect, useCallback } from 'react';
import ChatInput from './chatInput.tsx';
import FileList from './fileList.tsx';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import DragDropArea from './dragDropArea.tsx';
import { toast } from 'react-toastify';
import type { File } from '../types/file.ts';
import { useFileUpload } from '../hooks/useFileUpload';

interface Message {
  messageId: number;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  loading?: boolean;
}

function upsertMessageInList(list: Message[], msg: Message, matchId?: number) {
  const idx = matchId !== undefined ? list.findIndex((m) => m.messageId === matchId) : -1;
  if (idx !== -1) return [...list.slice(0, idx), msg, ...list.slice(idx + 1)];
  return [...list, msg];
}

function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<File[]>([]); 
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const upsertMessage = useCallback((msg: Message, matchId?: number) => {
    setMessages((prev) => upsertMessageInList(prev, msg, matchId));
  }, []);

  const fetchConversation = useCallback(async () => {
    try {
      const res = await fetch('/api/conversation/get');
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages(
          data.messages.map(
            (m: { messageId: number; sender: string; text: string }): Message => ({
              messageId: m.messageId,
              sender:
                m.sender === 'user'
                  ? 'user'
                  : m.sender === 'assistant'
                  ? 'assistant'
                  : 'system',
              text: m.text,
            })
          )
        );
      }
      if (Array.isArray(data.files)) {
        setFiles(data.files);
      }
      if (data.error) {
        const errorMsg = typeof data.error === 'string' ? data.error : data.error?.message || 'Unknown error';
        toast.error('Error fetching conversation: ' + errorMsg);
      }
    } catch {
      toast.error('Error fetching conversation.');
    }
  }, []);

  const { handleFileUpload: uploadFile } = useFileUpload(fetchConversation);

  // Helper: Stream and update assistant message
  async function streamAssistantResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    onToken: (token: string) => void,
    onError: (err: string) => void,
    onDone: () => void
  ) {
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
            if (data.token) onToken(data.token);
            if (data.done) onDone();
            if (data.error) onError(data.error);
          }
        }
      }
    }
    // Process any remaining buffer after stream ends
    if (buffer && buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.token) onToken(data.token);
        if (data.done) onDone();
        if (data.error) onError(data.error);
      } catch {
        // ignore JSON parse errors for trailing buffer
      }
    }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    const userMsgId = Date.now();
    upsertMessage({ messageId: userMsgId, sender: 'user', text: input });
    setInput('');
    const assistantMsgId = Date.now() + 1;
    // Insert the initial assistant message with the same messageId as will be used for streaming updates
    upsertMessage(
      { messageId: assistantMsgId, sender: 'assistant', text: '', loading: true },
      assistantMsgId
    );
    try {
      const history = [
        ...messages
          .filter((m) => m.sender === 'user' || m.sender === 'assistant')
          .map((m) => ({ role: m.sender, content: m.text })),
        { role: 'user', content: input },
      ];
      const res = await fetch('/api/conversation/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, history }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      await streamAssistantResponse(
        reader,
        decoder,
        (token) => {
          assistantText += token;
          upsertMessage(
            { messageId: assistantMsgId, sender: 'assistant', text: assistantText },
            assistantMsgId
          );
        },
        (err) => {
          let errorMsg = 'Error';
          if (typeof err === 'string') errorMsg = err;
          else if (err && typeof err === 'object' && 'message' in err) errorMsg = (err as { message: string }).message;
          toast.error(errorMsg);
          setLoading(false);
        },
        () => setLoading(false)
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !m.loading));
      let errorMsg = 'Error';
      if (err && typeof err === 'object' && 'message' in err) errorMsg = (err as { message: string }).message;
      else if (typeof err === 'string') errorMsg = err;
      toast.error(errorMsg);
      setLoading(false);
    }
  }, [input, messages, upsertMessage]);

  // Replace file upload logic with hook
  const handleFileUpload = (filesList: FileList) => {
    if (!filesList.length) return;
    const file = filesList[0];
    const tempFile: File = {
      id: 'uploading-' + Date.now(),
      fileName: file.name,
      uploading: true,
    };
    setFiles((prev) => [...prev, tempFile]);
    uploadFile(filesList); // Call the upload logic which will refresh files after upload
    // The tempFile will be replaced by the real file list after fetchConversation
  };
  // Use drag and drop hook
  const dragDrop = useDragAndDrop(
    handleFileUpload,
    chatAreaRef as React.RefObject<HTMLElement>
  );

  const handleClearConversation = useCallback(async () => {
    setLoading(true);
    await fetch('/api/conversation/clear', { method: 'POST' });
    setMessages([]);
    fetchConversation();
    setLoading(false);
  }, [fetchConversation]);

  // --- Derived values ---
  const visibleMessages = messages.filter(
    (msg) => msg.sender !== 'system'
  );

  // --- Effects ---
  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Render ---
  return (
    <>
      <div className='flex min-h-screen w-full items-center justify-center bg-zinc-900'>
        <DragDropArea
          dragActive={dragDrop.dragActive}
          handleDragOver={dragDrop.handleDragOver}
          handleDragLeave={dragDrop.handleDragLeave}
          handleDrop={dragDrop.handleDrop}
          className={'relative mx-4 flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-900 shadow-lg'}
          forwardedRef={chatAreaRef as React.RefObject<HTMLDivElement>}
        >
          <div className={'scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent flex min-h-0 flex-1 flex-col overflow-y-auto p-6'} ref={chatAreaRef} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className='flex w-full flex-1 flex-col'>
              {visibleMessages.map((msg) => (
                <div
                  key={msg.messageId}
                  className={`my-2 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={
                      'break-words break-all max-w-3xl whitespace-pre-line rounded-xl px-5 py-3 text-base shadow flex items-center min-h-[40px]' +
                      (msg.sender === 'user'
                        ? ' ml-auto mr-1 rounded-br-md bg-blue-600 text-white'
                        : ' ml-1 mr-auto rounded-bl-md border border-zinc-700 bg-zinc-800 text-zinc-100')
                    }
                  >
                    {msg.loading ? <span className='animate-pulse'>...thinking</span> : msg.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
              {visibleMessages.length === 0 && (
                <div className='mt-10 select-none text-center text-lg text-zinc-500'>
                  Chat with me
                </div>
              )}
            </div>
          </div>
          <div className='flex h-[9vh] max-h-[120px] min-h-[60px] flex-row items-end border-t border-zinc-300 bg-zinc-900'>
            <div className='h-full w-[40%] min-w-[220px] max-w-[420px] flex-shrink-0'>
              <div className='h-full'>
                <FileList files={files} />
              </div>
            </div>
            <div className='h-full flex-1'>
              <div className='flex h-full items-center p-4'>
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  disabled={loading}
                  onFileUpload={handleFileUpload}
                  dragActive={dragDrop.dragActive}
                  setDragActive={dragDrop.setDragActive}
                  className='h-full w-full'
                  onClearConversation={handleClearConversation}
                  clearLoading={loading}
                />
              </div>
            </div>
          </div>
        </DragDropArea>
      </div>
    </>
  );
}

export default ChatArea;