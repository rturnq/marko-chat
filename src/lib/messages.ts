// In-memory message store, one list per server process. Enough for the stub;
// swap it for real storage when the chat grows a backend.
export interface Message {
  id: number;
  author: string;
  text: string;
  sentAt: Date;
}

const messages: Message[] = [
  { id: 1, author: 'marko', text: 'Welcome to Marko Chat. Say something below.', sentAt: new Date() },
];

export function listMessages(): Message[] {
  return messages;
}

export function addMessage(author: string, text: string): Message {
  const message = { id: messages.length + 1, author, text, sentAt: new Date() };
  messages.push(message);
  return message;
}
