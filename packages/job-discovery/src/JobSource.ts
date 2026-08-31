export interface JobSearchQuery {
  title?: string;
  location?: string;
  remoteType?: string;
  employmentType?: string;
  limit?: number;
}

export interface JobResult {
  externalId: string;
  title: string;
  company: string;
  location?: string;
  remoteType?: string;
  description: string;
  url: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  postedAt: Date;
  skills: string[];
}

export interface JobDetails extends JobResult {
  details?: string;
  // Additional details if needed when getting a single job
}

export interface JobSource {
  name: string;
  searchJobs(query: JobSearchQuery): Promise<JobResult[]>;
  getJobDetails?(jobId: string): Promise<JobDetails>;
}
