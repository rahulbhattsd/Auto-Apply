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

export interface AIProvider {
  name: string;
  analyzeJob(candidate: CandidateData, job: JobData): Promise<AIAnalysisResult>;
}
