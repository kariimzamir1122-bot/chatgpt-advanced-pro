
export type AssistantId = 
  | 'chatgpt' 
  | 'doctor' 
  | 'psychologist' 
  | 'teacher' 
  | 'lawyer' 
  | 'business' 
  | 'translator' 
  | 'programmer';

export interface Assistant {
  id: AssistantId;
  name: string;
  role: string;
  description: string;
  icon: string;
  color: string;
  systemPrompt: string;
  disclaimer?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFavorite?: boolean;
  attachment?: {
    type: 'image' | 'file' | 'audio';
    url: string;
    name?: string;
  };
}

export interface Chat {
  id: string;
  assistantId: AssistantId;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export enum Tone {
  Professional = 'Professional',
  Friendly = 'Friendly',
  Short = 'Short',
  Detailed = 'Detailed',
  StepByStep = 'Step-by-step'
}

export enum Format {
  Bullets = 'Bullet points',
  Table = 'Table',
  Email = 'Email format',
  Summary = 'Summary'
}

export interface UserProfile {
  name: string;
  photo: string;
  language: string;
  isPro: boolean;
  messageCount: number;
}
