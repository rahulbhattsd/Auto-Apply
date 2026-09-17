import { z } from 'zod';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}

export interface AIAnalysisResult {
  matchScore: number;
  recommendation: string;
  skillsMatched: string[];
  skillsMissing: string[];
  experienceMatch: string | null;
  educationMatch: string | null;
  locationMatch: string | null;
  reasoning: string;
}

export interface CandidateData {
  skills: string[];
  experience: unknown;
  education: unknown;
  preferredRoles: string[];
  preferredLocations: string[];
}

export interface JobData {
  title: string;
  company: string;
  description: string;
  location: string | null;
  remoteType: string | null;
  skills: string[];
}

export interface ResumeInput {
  candidate: CandidateData;
  job: JobData;
}

export interface TailoredResume {
  content: Record<string, unknown>;
}

export interface CoverLetterInput {
  candidate: CandidateData;
  job: JobData;
}

export interface AIProvider {
  name: string;
  generateResponse(messages: ChatMessage[], options?: AIOptions): Promise<string>;
  streamResponse?(messages: ChatMessage[], options?: AIOptions, onChunk?: (chunk: string) => void): Promise<string>;
  generateStructuredOutput<T>(messages: ChatMessage[], schema: z.ZodSchema<T>, options?: AIOptions): Promise<T>;
  
  // Legacy / optional backward compatibility
  analyzeJob?(candidate: CandidateData, job: JobData): Promise<AIAnalysisResult>;
  tailorResume?(input: ResumeInput): Promise<TailoredResume>;
  generateCoverLetter?(input: CoverLetterInput): Promise<string>;
}
