import { JobSource, JobSearchQuery, JobResult } from './JobSource';

export class MockJobSource implements JobSource {
  name = 'mock-source';

  private jobs: JobResult[] = [
    {
      externalId: 'mock-1',
      title: 'Senior Frontend Engineer',
      company: 'TechCorp',
      location: 'San Francisco, CA',
      remoteType: 'Hybrid',
      description: 'Looking for a React expert with 5+ years of experience. You will build modern web applications. Requires strong TypeScript skills.',
      url: 'https://example.com/jobs/mock-1',
      employmentType: 'Full-time',
      salaryMin: 120000,
      salaryMax: 160000,
      currency: 'USD',
      postedAt: new Date(),
      skills: ['React', 'TypeScript', 'Frontend'],
    },
    {
      externalId: 'mock-2',
      title: 'Backend Developer Intern',
      company: 'StartupInc',
      location: 'Remote',
      remoteType: 'Remote',
      description: 'Join our backend team for a 3-month internship. Work with Node.js and PostgreSQL. We do not sponsor visas.',
      url: 'https://example.com/jobs/mock-2',
      employmentType: 'Internship',
      salaryMin: 40000,
      salaryMax: 50000,
      currency: 'USD',
      postedAt: new Date(),
      skills: ['Node.js', 'PostgreSQL'],
    },
    {
      externalId: 'mock-3',
      title: 'Full Stack Engineer',
      company: 'EnterpriseSolutions',
      location: 'New York, NY',
      remoteType: 'On-site',
      description: 'Seeking a Full Stack Engineer to maintain legacy systems and build new microservices. Must know Java and React.',
      url: 'https://example.com/jobs/mock-3',
      employmentType: 'Full-time',
      salaryMin: 140000,
      salaryMax: 180000,
      currency: 'USD',
      postedAt: new Date(),
      skills: ['Java', 'React', 'Microservices'],
    },
    {
      externalId: 'mock-4',
      title: 'Excluded Company Job',
      company: 'BadCompany',
      location: 'Remote',
      remoteType: 'Remote',
      description: 'This is a job from a company we want to filter out deterministically.',
      url: 'https://example.com/jobs/mock-4',
      employmentType: 'Full-time',
      salaryMin: 100000,
      salaryMax: 120000,
      currency: 'USD',
      postedAt: new Date(),
      skills: ['JavaScript'],
    }
  ];

  async searchJobs(query: JobSearchQuery): Promise<JobResult[]> {
    return this.jobs.filter(job => {
      if (query.title && !job.title.toLowerCase().includes(query.title.toLowerCase())) return false;
      if (query.location && !job.location?.toLowerCase().includes(query.location.toLowerCase())) return false;
      return true;
    });
  }

  async getJobDetails(jobId: string) {
    const job = this.jobs.find(j => j.externalId === jobId);
    if (!job) throw new Error('Job not found');
    return job;
  }
}
