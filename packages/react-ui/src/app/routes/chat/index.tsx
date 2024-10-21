import { useMutation, useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  ArrowUpIcon,
  Download,
  X,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/ui/chat/chat-input';
import { LoadingSpinner } from '@/components/ui/spinner';
import {
  FormResultTypes,
  humanInputApi,
} from '@/features/human-input/lib/human-input-api';
import { cn } from '@/lib/utils';
import { ApErrorParams, ChatUIResponse, ErrorCode, isNil } from '@activepieces/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MessagesList, Messages } from './messages-list';

export function ChatPage() {
  const { flowId } = useParams();
  const messagesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    data: chatUI,
    isLoading,
    isError: isLoadingError,
  } = useQuery<ChatUIResponse | null, Error>({
    queryKey: ['chat', flowId],
    queryFn: () => humanInputApi.getChatUI(flowId!, false),
    enabled: !isNil(flowId),
    staleTime: Infinity,
    retry: false,
  });

  const scrollToBottom = () => {
    messagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const chatId = useRef<string>(nanoid());
  const [messages, setMessages] = useState<Messages>([]);
  const [input, setInput] = useState('');
  const previousInputRef = useRef('');
  const [sendingError, setSendingError] = useState<ApErrorParams | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: async ({ isRetrying }: { isRetrying: boolean }) => {
      if (!flowId || !chatId) return null;
      const savedInput = isRetrying ? previousInputRef.current : input;
      previousInputRef.current = savedInput;
      setInput('');
      if (!isRetrying) {
        setMessages([...messages, { role: 'user', content: savedInput }]);
      }
      scrollToBottom();
      return humanInputApi.sendMessage({
        flowId,
        chatId: chatId.current,
        message: savedInput,
      });
    },
    onSuccess: (result) => {
      if (!result) {
        setSendingError({
          code: ErrorCode.NO_CHAT_RESPONSE,
          params: {},
        });
      } else if ('type' in result) {
        switch (result.type) {
          case FormResultTypes.FILE:
            if ('url' in result.value) {
              const isImage = result.value.mimeType?.startsWith('image/');
              setMessages([
                ...messages,
                {
                  role: 'bot',
                  content: result.value.url,
                  type: isImage ? 'image' : 'file',
                  mimeType: result.value.mimeType,
                },
              ]);
            }
            break;
          case FormResultTypes.MARKDOWN:
            setMessages([
              ...messages,
              { role: 'bot', content: result.value, type: 'text' },
            ]);
        }
      }
      scrollToBottom();
    },
    onError: (error: AxiosError) => {
      setSendingError(error.response?.data as ApErrorParams);
      scrollToBottom();
    },
  });

  useEffect(scrollToBottom, [messages, isSending]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage({ isRetrying: false });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && input) {
        onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  if (!flowId || isLoadingError) return <Navigate to="/404" />;

  if (isLoading) return <LoadingSpinner />

  return (
    <main
      className={cn(
        'flex w-full max-w-3xl flex-col items-center mx-auto py-6',
        messages.length > 0 ? 'h-screen' : 'h-[calc(50vh)]',
      )}
    >
      <MessagesList
        messagesRef={messagesRef}
        messages={messages}
        chatUI={chatUI}
        sendingError={sendingError}
        isSending={isSending}
        flowId={flowId}
        sendMessage={sendMessage}
        setSelectedImage={setSelectedImage}
      />
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8">
          <p className="animate-typing overflow-hidden whitespace-nowrap border-r-2 border-r-primary pr-1 text-xl text-gray-500 leading-6">
            {chatUI?.props.botName ? `${chatUI.props.botName}` : "What can I help you with today?"}
          </p>
        </div>
      )}
      <div className="w-full px-4">
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="relative rounded-full border bg-background"
        >
          <div className="flex items-center justify-between pe-1 pt-0">
            <ChatInput
              autoFocus
              value={input}
              onKeyDown={onKeyDown}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
            />
            <Button
              disabled={!input || isSending}
              type="submit"
              size="icon"
              className="rounded-full"
            >
              <ArrowUpIcon className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="bg-transparent border-none shadow-none flex items-center justify-center">
          <div className="relative">
            <img
              src={selectedImage || ''}
              alt="Full size image"
              className="h-auto object-contain max-h-[90vh] sm:max-w-[90vw] shadow-sm"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = selectedImage || '';
                  link.download = 'image';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
