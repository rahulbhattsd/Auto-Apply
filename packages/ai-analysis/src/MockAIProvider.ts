import {
  AIProvider,
  AIAnalysisResult,
  CandidateData,
  JobData,
  ResumeInput,
  TailoredResume,
  CoverLetterInput,
  ChatMessage,
  AIOptions,
} from './AIProvider.js';
import { z } from 'zod';

export class MockAIProvider implements AIProvider {
  name = 'mock';

  async generateResponse(messages: ChatMessage[], _options?: AIOptions): Promise<string> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    const lower = lastUserMessage.toLowerCase();

    if (lower.includes('calc') || lower.includes('+') || lower.includes('*')) {
      return `I evaluated that for you. The result is calculated accurately.`;
    }

    if (lower.includes('remember') || lower.includes('memory')) {
      return `I have noted and remembered that information for you.`;
    }

    if (lower.includes('recruiter') || lower.includes('email') || lower.includes('reply')) {
      return `Here is a professional reply tailored to your profile and preferred tone:\n\nThank you for reaching out. Based on my experience and technical background, I would be pleased to learn more about the role and explore potential alignment.\n\nBest regards,\nRahul`;
    }

    return `Hello! As your personal AI assistant, I am here to help you with your projects, coding, research, planning, and tasks. Based on our conversation and your preferences, here is the answer to your request:\n\n${lastUserMessage}`;
  }

  async streamResponse(
    messages: ChatMessage[],
    options?: AIOptions,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const response = await this.generateResponse(messages, options);
    const chunks = response.split(' ');
    for (const chunk of chunks) {
      if (onChunk) onChunk(chunk + ' ');
    }
    return response;
  }

  async generateStructuredOutput<T>(
    messages: ChatMessage[],
    _schema: z.ZodSchema<T>,
    _options?: AIOptions
  ): Promise<T> {
    const lastMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    return {
      intent: 'general_assistant',
      needsTool: false,
      summary: `Processed structured request: ${lastMsg.slice(0, 50)}`,
    } as unknown as T;
  }

  // Legacy application methods
  async analyzeJob(candidate: CandidateData, job: JobData): Promise<AIAnalysisResult> {
    const candidateSkillsLower = new Set(candidate.skills.map((s) => s.toLowerCase()));
    const jobSkills = job.skills.length > 0 ? job.skills : ['Software Engineering', 'Problem Solving'];
    
    const skillsMatched = jobSkills.filter((s) => candidateSkillsLower.has(s.toLowerCase()));
    const skillsMissing = jobSkills.filter((s) => !candidateSkillsLower.has(s.toLowerCase()));

    const matchRatio = jobSkills.length > 0 ? skillsMatched.length / jobSkills.length : 1;
    const matchScore = Math.max(75, Math.min(95, Math.round(75 + matchRatio * 20)));

    return {
      matchScore,
      recommendation: matchScore >= 70 ? 'APPLY' : 'REJECT',
      skillsMatched: skillsMatched.length > 0 ? skillsMatched : candidate.skills.slice(0, 2),
      skillsMissing,
      experienceMatch: 'Profile matches entry-level / junior software engineering requirements.',
      educationMatch: 'Educational background aligned with technology stack.',
      locationMatch: job.location || 'Remote eligible',
      reasoning: `Candidate demonstrates strong match for ${job.title} with verified skill proficiencies.`
    };
  }

  async tailorResume(input: ResumeInput): Promise<TailoredResume> {
    const experienceList = Array.isArray(input.candidate.experience) ? input.candidate.experience : [];
    const educationList = Array.isArray(input.candidate.education) ? input.candidate.education : [];

    return {
      content: {
        summary: `Motivated engineer targeting ${input.job.title} at ${input.job.company}. Proficient in ${input.candidate.skills.slice(0, 4).join(', ')}.`,
        skills: [...input.candidate.skills],
        experience: experienceList,
        education: educationList,
      },
    };
  }

  async generateCoverLetter(input: CoverLetterInput): Promise<string> {
    return `Dear Hiring Team at ${input.job.company},\n\nI am writing to express my enthusiastic interest in the ${input.job.title} position. With my background in ${input.candidate.skills.slice(0, 3).join(', ')}, I am confident in my ability to make an immediate positive contribution to your engineering team.\n\nThank you for considering my application.\n\nSincerely,\nCandidate`;
  }
}
