
import { Employee, EmployeeStatus, JobPosting, JobStatus, Candidate, CandidateStatus } from "../types.ts";

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    role: 'Senior React Engineer',
    department: 'Engineering',
    email: 'sarah.j@nexushr.com',
    joinDate: '2022-03-15',
    status: EmployeeStatus.ACTIVE,
    performanceRating: 4.8,
    avatar: 'https://picsum.photos/seed/sarah/200',
  },
  {
    id: '2',
    name: 'Michael Chen',
    role: 'Product Manager',
    department: 'Product',
    email: 'm.chen@nexushr.com',
    joinDate: '2021-11-01',
    status: EmployeeStatus.ACTIVE,
    performanceRating: 4.2,
    avatar: 'https://picsum.photos/seed/michael/200',
  },
  {
    id: '3',
    name: 'Emily Davis',
    role: 'UX Designer',
    department: 'Design',
    email: 'emily.d@nexushr.com',
    joinDate: '2023-06-10',
    status: EmployeeStatus.ON_LEAVE,
    performanceRating: 3.9,
    avatar: 'https://picsum.photos/seed/emily/200',
  },
];

export const MOCK_JOBS: JobPosting[] = [
  {
    id: '101',
    title: 'Frontend Developer',
    department: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
    status: JobStatus.OPEN,
    postedDate: '2023-10-01',
    applicantsCount: 12,
    description: 'We are looking for a skilled React developer...',
    requirements: ['React', 'TypeScript', 'Tailwind']
  },
  {
    id: '102',
    title: 'Marketing Specialist',
    department: 'Marketing',
    location: 'New York, NY',
    type: 'Full-time',
    status: JobStatus.OPEN,
    postedDate: '2023-10-05',
    applicantsCount: 2, // Matched to actual candidates
    description: 'Join our growth team and help us reach new heights. We need someone with strong SEO and content marketing skills.',
    requirements: ['SEO', 'Content Marketing', 'Analytics']
  }
];

export const MOCK_CANDIDATES: Candidate[] = [
  {
    id: 'c1',
    jobId: '101',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-0123',
    status: CandidateStatus.APPLIED,
    appliedDate: '2023-10-10',
    resumeText: "Experienced frontend developer with 5 years in React, Redux, and Node.js. Passionate about UI/UX.",
    emailContent: "Dear Hiring Manager, I am writing to express my interest in the Frontend Developer position. I have been following NexusHR's work and admire the innovation in HR tech. I believe my skills in React and passion for clean UI would be a great fit.",
  },
  {
    id: 'c2',
    jobId: '101',
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-0199',
    status: CandidateStatus.SCREENING,
    appliedDate: '2023-10-11',
    resumeText: "Junior developer familiar with HTML, CSS, and basic JavaScript. Eager to learn React.",
    emailContent: "Hi, here is my resume for the dev job. Thanks.",
  },
  {
    id: 'c3',
    jobId: '102',
    name: 'Alice Johnson',
    email: 'alice.j@example.com',
    phone: '555-0200',
    status: CandidateStatus.INTERVIEW,
    appliedDate: '2023-10-12',
    resumeText: "Marketing professional with 3 years of experience in SEO and social media campaigns.",
    emailContent: "I'm excited to apply for the Marketing Specialist role.",
  },
  {
    id: 'c4',
    jobId: '102',
    name: 'Bob Williams',
    email: 'bob.w@example.com',
    phone: '555-0201',
    status: CandidateStatus.APPLIED,
    appliedDate: '2023-10-13',
    resumeText: "Fresh graduate with a degree in Marketing and strong analytical skills.",
    emailContent: "Please consider my application for the marketing position.",
  }
];
