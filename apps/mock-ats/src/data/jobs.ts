export interface MockJob {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string;
  requirements: string[];
  salary?: { min: number; max: number; currency: string };
  ats: 'greenhouse' | 'lever' | 'workday' | 'ashby' | 'workable' | 'darwinbox';
  /** tenant/board slug used in URL */
  tenant: string;
  department: string;
  postedAt: string;
  expiresAt: string;
  customQuestions: CustomQuestion[];
}

export interface CustomQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number';
  required: boolean;
  options?: string[]; // for select
}

export const JOBS: MockJob[] = [
  // ── Greenhouse (board: techcorp) ──────────────────────────────────────────
  {
    id: 'gh-001',
    title: 'Software Engineer – Backend',
    company: 'TechCorp',
    location: 'San Francisco, CA',
    remote: true,
    department: 'Engineering',
    ats: 'greenhouse',
    tenant: 'techcorp',
    postedAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `TechCorp is looking for a Backend Software Engineer to join our Platform team.
You will design, build, and maintain high-throughput microservices that power our SaaS platform used by 10 million users worldwide.

Responsibilities:
- Design scalable REST / gRPC APIs
- Own full SDLC of backend services (Node.js, Go)
- Collaborate with ML and data teams
- Participate in on-call rotation`,
    requirements: [
      '2+ years of backend engineering experience',
      'Proficiency in Node.js or Go',
      'Experience with PostgreSQL and Redis',
      'Understanding of distributed systems',
    ],
    salary: { min: 120000, max: 160000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Years of professional software experience', type: 'number', required: true },
      { id: 'q2', label: 'Are you authorized to work in the US?', type: 'select', required: true, options: ['Yes', 'No', 'Will require sponsorship'] },
      { id: 'q3', label: 'Preferred start date', type: 'text', required: false },
    ],
  },
  {
    id: 'gh-002',
    title: 'Product Manager – Growth',
    company: 'TechCorp',
    location: 'New York, NY',
    remote: false,
    department: 'Product',
    ats: 'greenhouse',
    tenant: 'techcorp',
    postedAt: '2026-09-03T00:00:00Z',
    expiresAt: '2026-10-15T00:00:00Z',
    description: `Drive growth initiatives across TechCorp's consumer and enterprise product lines.
You will work closely with engineering, design, and data analytics to define and ship features.

Responsibilities:
- Define OKRs and track KPIs for growth squad
- Run A/B experiments on acquisition and retention flows
- Write detailed PRDs and coordinate cross-functional launches`,
    requirements: [
      '3+ years of product management',
      'Strong data literacy (SQL, analytics tools)',
      'Experience with B2B SaaS products',
    ],
    salary: { min: 130000, max: 170000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Describe your biggest product launch', type: 'textarea', required: true },
      { id: 'q2', label: 'Are you comfortable with SQL?', type: 'select', required: true, options: ['Yes – proficient', 'Somewhat', 'No'] },
    ],
  },
  {
    id: 'gh-003',
    title: 'Frontend Engineer – React',
    company: 'TechCorp',
    location: 'Austin, TX',
    remote: true,
    department: 'Engineering',
    ats: 'greenhouse',
    tenant: 'techcorp',
    postedAt: '2026-09-10T00:00:00Z',
    expiresAt: '2026-11-01T00:00:00Z',
    description: `Build next-generation UI components and features for TechCorp's flagship web product.`,
    requirements: [
      '2+ years React / TypeScript',
      'Experience with state management (Redux, Zustand, or Jotai)',
      'Strong CSS / accessibility fundamentals',
    ],
    salary: { min: 110000, max: 150000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'GitHub or portfolio URL', type: 'text', required: false },
      { id: 'q2', label: 'Do you require visa sponsorship?', type: 'select', required: true, options: ['No', 'Yes'] },
    ],
  },

  // ── Lever (tenant: financehub) ────────────────────────────────────────────
  {
    id: 'lv-001',
    title: 'Data Analyst',
    company: 'FinanceHub',
    location: 'Chicago, IL',
    remote: false,
    department: 'Analytics',
    ats: 'lever',
    tenant: 'financehub',
    postedAt: '2026-09-05T00:00:00Z',
    expiresAt: '2026-10-20T00:00:00Z',
    description: `FinanceHub is hiring a Data Analyst to support our risk and compliance team.
You will analyze large financial datasets and surface actionable insights to senior stakeholders.`,
    requirements: [
      'Bachelor in Finance, Statistics, or CS',
      'Advanced SQL and Python (pandas, matplotlib)',
      'Experience with Tableau or Power BI',
    ],
    salary: { min: 80000, max: 105000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Describe a data project you are proud of', type: 'textarea', required: true },
      { id: 'q2', label: 'Years of SQL experience', type: 'number', required: true },
    ],
  },
  {
    id: 'lv-002',
    title: 'Quantitative Developer',
    company: 'FinanceHub',
    location: 'Chicago, IL',
    remote: true,
    department: 'Quant',
    ats: 'lever',
    tenant: 'financehub',
    postedAt: '2026-09-08T00:00:00Z',
    expiresAt: '2026-10-25T00:00:00Z',
    description: `Develop and maintain quantitative trading models and supporting infrastructure at FinanceHub.`,
    requirements: [
      'Strong Python and C++ skills',
      'Understanding of financial derivatives',
      'Experience with time-series data',
    ],
    salary: { min: 140000, max: 200000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Have you worked in HFT environments?', type: 'select', required: true, options: ['Yes', 'No'] },
      { id: 'q2', label: 'Preferred work arrangement', type: 'select', required: true, options: ['Remote', 'Hybrid', 'On-site'] },
    ],
  },
  {
    id: 'lv-003',
    title: 'UX Designer',
    company: 'FinanceHub',
    location: 'Remote',
    remote: true,
    department: 'Design',
    ats: 'lever',
    tenant: 'financehub',
    postedAt: '2026-09-12T00:00:00Z',
    expiresAt: '2026-11-01T00:00:00Z',
    description: `Design intuitive user experiences for FinanceHub's investor portal and mobile apps.`,
    requirements: [
      '3+ years UX/Product design',
      'Figma proficiency',
      'Experience designing for regulated industries (fintech, banking)',
    ],
    salary: { min: 95000, max: 130000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Portfolio link', type: 'text', required: true },
      { id: 'q2', label: 'Figma experience level', type: 'select', required: true, options: ['Beginner', 'Intermediate', 'Advanced'] },
    ],
  },

  // ── Workday (tenant: healthstart) ─────────────────────────────────────────
  {
    id: 'wd-001',
    title: 'Full Stack Engineer',
    company: 'HealthStart',
    location: 'Boston, MA',
    remote: true,
    department: 'Engineering',
    ats: 'workday',
    tenant: 'healthstart',
    postedAt: '2026-09-02T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `Build patient-facing digital health features at HealthStart, a Series B health-tech startup.
Stack: React, Node.js, PostgreSQL, AWS.`,
    requirements: [
      '3+ years full-stack experience',
      'React and Node.js',
      'HIPAA awareness preferred',
    ],
    salary: { min: 115000, max: 155000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Have you worked in a healthcare environment before?', type: 'select', required: false, options: ['Yes', 'No'] },
      { id: 'q2', label: 'Earliest available start date', type: 'text', required: true },
    ],
  },
  {
    id: 'wd-002',
    title: 'DevOps Engineer',
    company: 'HealthStart',
    location: 'Boston, MA',
    remote: false,
    department: 'Infrastructure',
    ats: 'workday',
    tenant: 'healthstart',
    postedAt: '2026-09-07T00:00:00Z',
    expiresAt: '2026-10-15T00:00:00Z',
    description: `Own cloud infrastructure, CI/CD pipelines, and observability at HealthStart.`,
    requirements: [
      'AWS (ECS, RDS, VPC)',
      'Terraform and Ansible',
      'Kubernetes or ECS experience',
    ],
    salary: { min: 120000, max: 160000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'AWS certifications held', type: 'text', required: false },
      { id: 'q2', label: 'Do you hold or require security clearance?', type: 'select', required: true, options: ['No', 'Yes – active', 'In progress'] },
    ],
  },
  {
    id: 'wd-003',
    title: 'Machine Learning Engineer',
    company: 'HealthStart',
    location: 'Remote',
    remote: true,
    department: 'AI/ML',
    ats: 'workday',
    tenant: 'healthstart',
    postedAt: '2026-09-14T00:00:00Z',
    expiresAt: '2026-11-14T00:00:00Z',
    description: `Train and deploy clinical NLP models to extract structured insights from medical notes.`,
    requirements: [
      'Python (PyTorch or TensorFlow)',
      'NLP / transformers experience',
      'MLOps with SageMaker or equivalent',
    ],
    salary: { min: 140000, max: 190000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Describe an ML model you deployed to production', type: 'textarea', required: true },
      { id: 'q2', label: 'Publications or open-source links', type: 'text', required: false },
    ],
  },

  // ── Ashby (tenant: retailgiant) ───────────────────────────────────────────
  {
    id: 'ab-001',
    title: 'Software Engineer – Platform',
    company: 'RetailGiant',
    location: 'Seattle, WA',
    remote: true,
    department: 'Platform Engineering',
    ats: 'ashby',
    tenant: 'retailgiant',
    postedAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-10-30T00:00:00Z',
    description: `Build the internal developer platform at RetailGiant powering 500+ engineers.`,
    requirements: [
      'Platform engineering or SRE background',
      'Kubernetes and Helm',
      'Go or Python',
    ],
    salary: { min: 130000, max: 170000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'What platform tools have you built?', type: 'textarea', required: true },
    ],
  },
  {
    id: 'ab-002',
    title: 'Business Intelligence Analyst',
    company: 'RetailGiant',
    location: 'Seattle, WA',
    remote: false,
    department: 'Finance',
    ats: 'ashby',
    tenant: 'retailgiant',
    postedAt: '2026-09-09T00:00:00Z',
    expiresAt: '2026-10-09T00:00:00Z',
    description: `Build dashboards and data pipelines to inform retail buying and supply chain decisions.`,
    requirements: [
      'SQL and dbt',
      'Looker or Metabase',
      'Retail or e-commerce data experience preferred',
    ],
    salary: { min: 85000, max: 115000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Describe a dashboard you built from scratch', type: 'textarea', required: true },
      { id: 'q2', label: 'Proficient BI tools', type: 'text', required: false },
    ],
  },
  {
    id: 'ab-003',
    title: 'Security Engineer',
    company: 'RetailGiant',
    location: 'Seattle, WA',
    remote: false,
    department: 'Security',
    ats: 'ashby',
    tenant: 'retailgiant',
    postedAt: '2026-09-11T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `Secure RetailGiant's e-commerce infrastructure and conduct threat modeling.`,
    requirements: [
      'AppSec or CloudSec background',
      'OWASP Top 10 familiarity',
      'Security scanning tools (Snyk, Trivy)',
    ],
    salary: { min: 130000, max: 175000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Certifications (CISSP, OSCP, etc.)', type: 'text', required: false },
      { id: 'q2', label: 'Bug bounty experience?', type: 'select', required: false, options: ['Yes', 'No'] },
    ],
  },

  // ── Workable (tenant: devagency) ──────────────────────────────────────────
  {
    id: 'wk-001',
    title: 'Junior Software Developer',
    company: 'DevAgency',
    location: 'Remote',
    remote: true,
    department: 'Engineering',
    ats: 'workable',
    tenant: 'devagency',
    postedAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-11-30T00:00:00Z',
    description: `DevAgency is hiring junior developers for client delivery projects. You will work on web and mobile apps across fintech, e-commerce, and healthcare clients.`,
    requirements: [
      '0-2 years experience or strong portfolio',
      'JavaScript / TypeScript fundamentals',
      'Willingness to learn fast',
    ],
    salary: { min: 60000, max: 80000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'GitHub profile or portfolio', type: 'text', required: true },
      { id: 'q2', label: 'Earliest start date', type: 'text', required: true },
    ],
  },
  {
    id: 'wk-002',
    title: 'React Native Developer',
    company: 'DevAgency',
    location: 'Remote',
    remote: true,
    department: 'Mobile',
    ats: 'workable',
    tenant: 'devagency',
    postedAt: '2026-09-06T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `Build cross-platform mobile apps for DevAgency's growing client base.`,
    requirements: [
      '2+ years React Native',
      'App Store / Play Store deployment experience',
      'Expo or bare workflow',
    ],
    salary: { min: 90000, max: 120000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Link to an app you shipped', type: 'text', required: false },
    ],
  },
  {
    id: 'wk-003',
    title: 'QA Automation Engineer',
    company: 'DevAgency',
    location: 'Remote',
    remote: true,
    department: 'Quality',
    ats: 'workable',
    tenant: 'devagency',
    postedAt: '2026-09-13T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `Design and maintain automated test suites (Playwright, Cypress) across client projects.`,
    requirements: [
      'Playwright or Cypress',
      'API testing (Postman/Newman or similar)',
      'CI/CD integration experience',
    ],
    salary: { min: 80000, max: 110000, currency: 'USD' },
    customQuestions: [
      { id: 'q1', label: 'Test frameworks you have used', type: 'text', required: true },
    ],
  },

  // ── Darwinbox (tenant: globalcorp) ────────────────────────────────────────
  {
    id: 'db-001',
    title: 'Software Engineer I',
    company: 'GlobalCorp',
    location: 'Bangalore, India',
    remote: false,
    department: 'Engineering',
    ats: 'darwinbox',
    tenant: 'globalcorp',
    postedAt: '2026-09-03T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `GlobalCorp is hiring Software Engineer I for our Bangalore office. Work on enterprise ERP modules serving Fortune 500 clients.`,
    requirements: [
      'B.Tech / B.E. in CS or related',
      'Java or Python',
      '0-2 years experience (freshers welcome)',
    ],
    salary: { min: 800000, max: 1200000, currency: 'INR' },
    customQuestions: [
      { id: 'q1', label: 'CGPA / Percentage', type: 'text', required: true },
      { id: 'q2', label: 'Notice period (in days)', type: 'number', required: true },
    ],
  },
  {
    id: 'db-002',
    title: 'Associate Product Manager',
    company: 'GlobalCorp',
    location: 'Hyderabad, India',
    remote: false,
    department: 'Product',
    ats: 'darwinbox',
    tenant: 'globalcorp',
    postedAt: '2026-09-08T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    description: `Join GlobalCorp's product team as an APM, working on HRMS product features.`,
    requirements: [
      'MBA or equivalent',
      'Understanding of B2B SaaS',
      'Strong communication and stakeholder management',
    ],
    salary: { min: 1000000, max: 1500000, currency: 'INR' },
    customQuestions: [
      { id: 'q1', label: 'Have you used Darwinbox as a user?', type: 'select', required: false, options: ['Yes', 'No'] },
      { id: 'q2', label: 'Current CTC (in LPA)', type: 'text', required: true },
    ],
  },
  {
    id: 'db-003',
    title: 'Data Engineer',
    company: 'GlobalCorp',
    location: 'Remote – India',
    remote: true,
    department: 'Data',
    ats: 'darwinbox',
    tenant: 'globalcorp',
    postedAt: '2026-09-14T00:00:00Z',
    expiresAt: '2026-11-14T00:00:00Z',
    description: `Build and maintain data pipelines for GlobalCorp's analytics platform.`,
    requirements: [
      'Apache Spark / Flink',
      'Python and SQL',
      'Cloud data warehouses (BigQuery, Snowflake, or Redshift)',
    ],
    salary: { min: 1200000, max: 1800000, currency: 'INR' },
    customQuestions: [
      { id: 'q1', label: 'Data pipeline tools used', type: 'text', required: true },
      { id: 'q2', label: 'Notice period (days)', type: 'number', required: true },
    ],
  },
];
