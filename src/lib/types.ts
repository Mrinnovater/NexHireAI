
export type RoleType = 'candidate' | 'recruiter' | 'admin';

export interface Role {
  id: string;
  name: string;
  description: string;
  subSkills: string[];
}

export interface Question {
    id: string;
    questionText: string;
    type: 'mcq' | 'short' | 'coding' | 'scenario' | 'debugging';
    options?: string[];
    correctAnswer?: string;
    testCases?: { input: string; expectedOutput: string; }[];
    difficulty: 'Easy' | 'Medium' | 'Hard';
    skill: string; 
    tags: string[];
    starterCode?: string;
    timeLimit: number;
}

export interface UserResponse {
    questionId: string;
    skill: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    answer?: string;
    code?: string;
    language?: string;
    timeTaken: number;
    isCorrect?: boolean; 
    testCasesPassed?: number;
    totalTestCases?: number; 
    executionResult?: CodeExecutionResult[];
}

export interface Assessment {
    id: string;
    roleId: string;
    roleName: string;
    questions: Question[];
    totalTimeLimit: number;
    isTemplate: boolean;
    templateId?: string;
    rootAssessmentId?: string;
}

export interface AssessmentTemplate {
    id: string;
    name: string;
    role: string;
    roleId: string;
    skills: string[];
    questionCount: number;
    duration: number;
    difficultyMix: { easy: number; medium: number; hard: number; };
    questionIds: string[];
    questions?: Question[];
    status: 'active' | 'draft';
    version: string;
    createdBy: string;
    createdAt: number;
}

export interface JobPosition {
    id: string;
    role: string;
    domain: string;
    topics: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    questionBankId: string;
    createdBy: string;
    createdAt: number;
}

export interface InterviewQuestion {
    id: number;
    question: string;
    topic: string;
    difficulty: string;
}

export interface InterviewQuestionBank {
    id: string;
    jobPositionId: string;
    questions: InterviewQuestion[];
    createdBy: string;
    createdAt: number;
}

export interface VoiceInterviewAttempt {
    id: string;
    candidateId: string;
    candidateName?: string;
    candidateEmail?: string;
    jobPositionId: string;
    jobTitle?: string;
    cohortId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'evaluated';
    selectedQuestions: InterviewQuestion[];
    transcripts: string[];
    startedAt: number;
    completedAt?: number;
    timeTaken?: number;
    antiCheating: {
        tabSwitchCount: number;
        speechDuration: number[];
    };
    evaluation?: InterviewEvaluation;
}

export interface InterviewEvaluation {
    evaluation: {
        question: string;
        technical_score: number;
        communication_score: number;
        confidence_score: number;
        remarks: string;
    }[];
    overall_scores: {
        technical_knowledge: number;
        communication: number;
        confidence: number;
    };
    final_recommendation: 'Strong Hire' | 'Hire' | 'Borderline' | 'Reject';
    summary: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  avatarUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  resumeUrl?: string;
  xp?: number;
  badges?: string[];
  createdAt?: any;
  candidateSpecific?: any;
  recruiterSpecific?: any;
  analysis?: any;
}

export interface AssessmentAttempt {
    id: string;
    docId?: string;
    userId: string;
    assessmentId: string;
    roleId: string;
    startedAt: number;
    submittedAt?: number;
    responses: UserResponse[];
    rootAssessmentId?: string;
    questionSnapshots?: any[];
    finalScore?: number;
    skillScores?: Record<string, number | 'Not available'>; 
    aiFeedback?: any;
}

export interface Cohort {
    id: string;
    name: string;
    createdBy: string;
    createdAt: number;
    candidateIds: string[];
    candidates?: User[];
    assignedAssessmentId?: string;
    assignedAssessmentName?: string;
    assessmentAssignedAt?: number;
    statuses?: { [candidateId: string]: any };
}

export interface Notification {
    id: string;
    title: string;
    message: string;
    link?: string;
    isRead: boolean;
    createdAt: number;
}

export type CodeExecutionResult = {
    status: 'Passed' | 'Failed' | 'Error' | 'Time Limit Exceeded';
    output: string;
    expectedOutput?: string;
    time: string;
    memory: string;
};
