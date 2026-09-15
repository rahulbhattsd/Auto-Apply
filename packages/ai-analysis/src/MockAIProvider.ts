import { AIProvider, AIAnalysisResult, CandidateData, JobData, ResumeInput, TailoredResume, CoverLetterInput } from './AIProvider';

export class MockAIProvider implements AIProvider {
  name = 'mock';

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
