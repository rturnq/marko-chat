import { shortId } from "./ids";

export const enum UserStatus {
  Offline = 0,
  Active = 1,
  Away = 2,
}

export interface User {
  id: string;
  name: string;
  displayName: string;
  status: UserStatus;
}

export interface Channel {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface Reaction {
  id: string;
  messageId: string;
  symbol: string;
  createdAt: Date;
  authorIds: Set<string>;
}

export interface MessageReaction {
  symbol: string;
  authors: {
    authorId: string;
    authorName: string;
  }[];
}

export interface JoinedMessage extends Message {
  authorName: string;
  reactions: MessageReaction[];
}

const users = new Map<string, User>();
const channels = new Map<string, Channel>();
const messages = new Map<string, Message>();
const channelMessages = new Map<string, Message[]>();
const reactions = new Map<string, Reaction>();
seed();

export function getUser(id: string): Promise<User | undefined> {
  return withDelay(users.get(id));
}

export function getUserByName(name: string): Promise<User | undefined> {
  for (const user of users.values()) {
    if (user.name === name) {
      return withDelay(user);
    }
  }
  return withDelay(undefined);
}

export function getOnlineMembers(): Promise<User[]> {
  const result: User[] = [];
  for (const user of users.values()) {
    if (user.status !== UserStatus.Offline) {
      result.push(user);
    }
  }
  return withDelay(result.sort(compareUserByDisplayNameAsc));
}

export function getOfflineMembers(): Promise<User[]> {
  const result: User[] = [];
  for (const user of users.values()) {
    if (user.status === UserStatus.Offline) {
      result.push(user);
    }
  }
  return withDelay(result.sort(compareUserByDisplayNameAsc));
}

export function createUser(name: string): Promise<User> {
  for (const user of users.values()) {
    if (user.name === name) {
      throw new Error(`User with name ${name} already exists`);
    }
  }
  const user: User = {
    id: shortId(),
    name: name,
    displayName: name,
    status: UserStatus.Active,
  };
  users.set(user.id, user);
  return withDelay(user);
}

export function updateUserDisplayName(
  id: string,
  displayName: string,
): Promise<User | undefined> {
  const user = users.get(id);
  if (user) {
    user.displayName = displayName;
  }
  return withDelay(user);
}

export function updateUserStatus(
  id: string,
  status: UserStatus,
): Promise<User | undefined> {
  const user = users.get(id);
  if (user) {
    user.status = status;
  }
  return withDelay(user);
}

export function getChannels(): Promise<Channel[]> {
  return withDelay([...channels.values()]);
}

export function getDefaultChannel(): Promise<Channel> {
  for (const channel of channels.values()) {
    return withDelay(channel);
  }
  throw new Error("No channels have been created");
}

export function getChannelBySlug(slug: string): Promise<Channel | undefined> {
  for (const channel of channels.values()) {
    if (channel.slug === slug) {
      return withDelay(channel);
    }
  }
  return withDelay(undefined);
}

export function getChannelByMessageId(messageId: string): Promise<Channel | undefined> {
  const message = messages.get(messageId);
  if (message) {
    return withDelay(channels.get(message.channelId));
  }
  return withDelay(undefined);
}

export function createChannel(name: string, ownerId: string): Promise<Channel> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/, "-")
    .replace(/^-+|-+$/, "");
  for (const channel of channels.values()) {
    if (channel.slug === slug) {
      throw new Error(`Channel with name ${name} already exists`);
    }
  }
  const channel: Channel = {
    id: shortId(10),
    ownerId,
    slug,
    name,
  };
  channels.set(channel.id, channel);
  channelMessages.set(channel.slug, []);
  return withDelay(channel);
}

export function getMessages(channelSlug: string): Promise<JoinedMessage[]> {
  const messagesForChannel = channelMessages.get(channelSlug);
  return withDelay(
    messagesForChannel
      ? (messagesForChannel as JoinedMessage[]).map((message) => {
          message.authorName =
            users.get(message.authorId)?.displayName || "Unknown User";
          message.reactions = [];
          for (const { messageId, symbol, authorIds } of reactions.values()) {
            if (messageId === message.id && authorIds.size) {
              message.reactions.push({
                symbol,
                authors: [...authorIds].map((authorId) => ({
                  authorId,
                  authorName:
                    users.get(authorId)?.displayName || "Unknown User",
                })),
              });
            }
          }
          return message;
        })
      : [],
  );
}

export function createMessage(
  channelId: string,
  authorId: string,
  text: string,
): Promise<Message> {
  const channel = channels.get(channelId);
  if (!channel) {
    throw new Error(`No channel with id ${channelId}`);
  }

  const message: Message = {
    id: shortId(),
    channelId,
    authorId,
    text,
    createdAt: new Date(),
    editedAt: null,
  };
  messages.set(message.id, message);
  const arr = channelMessages.get(channel!.slug);
  if (arr) {
    arr.push(message);
    arr.sort(compareMessagesByServerTsDesc);
  }
  return withDelay(message);
}

export function updateMessage(
  messageId: string,
  authorId: string,
  text: string,
): Promise<Message> {
  const message = messages.get(messageId);
  if (!message) {
    throw new Error(`No message with id ${messageId}`);
  } else if (message.authorId !== authorId) {
    throw new Error(`Cannot edit message for other user`);
  }
  if (text !== message.text) {
    message.text = text;
    message.editedAt = new Date();
  }
  return withDelay(message);
}

export function toggleReaction(
  messageId: string,
  authorId: string,
  symbol: string,
): Promise<Reaction> {
  const message = messages.get(messageId);
  if (!message) {
    throw new Error(`No message with id ${messageId}`);
  }
  const key = `${messageId}:${symbol}`;
  let reaction = reactions.get(key);
  if (!reaction) {
    reaction = {
      id: shortId(10),
      messageId,
      symbol,
      createdAt: new Date(),
      authorIds: new Set(),
    };
    reactions.set(key, reaction);
  }
  if (reaction.authorIds.has(authorId)) {
    reaction.authorIds.delete(authorId);
  } else {
    reaction.authorIds.add(authorId);
  }
  return withDelay(reaction);
}

function compareMessagesByServerTsDesc(a: Message, b: Message) {
  return b.createdAt.getDate() - a.createdAt.getDate();
}

function compareUserByDisplayNameAsc(a: User, b: User) {
  return a.displayName.localeCompare(b.displayName);
}

async function delay(ms: number = 200) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withDelay<T>(value: T): Promise<T> {
  await delay();
  return value;
}

function seed() {
  const user: User = {
    id: shortId(10),
    name: "_system",
    displayName: "Admin",
    status: UserStatus.Active,
  };
  const channel: Channel = {
    id: shortId(10),
    ownerId: user.id,
    slug: "general",
    name: "General",
  };
  const message: Message = {
    id: shortId(),
    channelId: channel.id,
    authorId: user.id,
    text: "Welcome!",
    createdAt: new Date(),
    editedAt: null,
  };
  users.set(user.id, user);
  channels.set(channel.id, channel);
  messages.set(message.id, message);
  channelMessages.set(channel.slug, [message]);
}
