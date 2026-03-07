
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Cohort, AssessmentAttempt, VoiceInterviewAttempt } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Circle, Clock, Lock, Play, ChevronRight, Briefcase, XCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type StageStatus = 'completed' | 'current' | 'pending' | 'locked' | 'rejected' | 'hired';

interface ApplicationStage {
    id: string;
    title: string;
    description: string;
    status: StageStatus;
    actionLabel?: string;
    actionLink?: string;
}

export default function MyApplicationsPage() {
    const { user } = useAuth();
    const { firestore } = initializeFirebase();
    const [isLoading, setIsLoading] = useState(true);
    const [applications, setApplications] = useState<any[]>([]);

    useEffect(() => {
        if (!user || !firestore) return;

        // Listen to cohorts the candidate is part of
        const q = query(collection(firestore, 'cohorts'), where('candidateIds', 'array-contains', user.id));
        const unsub = onSnapshot(q, async (snapshot) => {
            const appData = await Promise.all(snapshot.docs.map(async (cohortDoc) => {
                const cohort = { id: cohortDoc.id, ...cohortDoc.data() } as Cohort;
                
                // Fetch Technical Assessment status
                const techQ = query(collection(firestore, `users/${user.id}/assessments`), where('rootAssessmentId', '==', cohort.assignedAssessmentId || 'none'));
                const techSnap = await getDocs(techQ);
                const isTechDone = !techSnap.empty;

                // Fetch AI Voice Interview status
                const interviewQ = query(collection(firestore, 'interviewAttempts'), where('candidateId', '==', user.id), where('cohortId', '==', cohort.id));
                const interviewSnap = await getDocs(interviewQ);
                const interviewAttempt = interviewSnap.empty ? null : { id: interviewSnap.docs[0].id, ...interviewSnap.docs[0].data() } as VoiceInterviewAttempt;
                const isInterviewDone = interviewAttempt?.status === 'evaluated';
                const isInterviewInvited = !!interviewAttempt;

                const recruiterDecision = cohort.statuses?.[user.id];

                const stages: ApplicationStage[] = [
                    {
                        id: 'application',
                        title: 'Application Submitted',
                        description: 'Your profile has been shared with the recruiter.',
                        status: 'completed'
                    },
                    {
                        id: 'tech_test',
                        title: 'Technical Assessment',
                        description: cohort.assignedAssessmentId ? `Test assigned: ${cohort.assignedAssessmentName}` : 'Waiting for recruiter to assign a test.',
                        status: isTechDone ? 'completed' : (cohort.assignedAssessmentId ? 'current' : 'pending'),
                        actionLabel: isTechDone ? undefined : (cohort.assignedAssessmentId ? 'Start Test' : undefined),
                        actionLink: '/skill-assessment'
                    },
                    {
                        id: 'ai_interview',
                        title: 'AI Voice Interview',
                        description: isInterviewInvited ? 'You have been invited to a verbal interview.' : 'Unlock this stage by passing the technical assessment.',
                        status: isInterviewDone ? 'completed' : (isInterviewInvited ? 'current' : (isTechDone ? 'pending' : 'locked')),
                        actionLabel: isInterviewDone ? undefined : (isInterviewInvited ? 'Start Interview' : undefined),
                        actionLink: interviewAttempt ? `/candidate/interview/${interviewAttempt.id}` : undefined
                    },
                    {
                        id: 'final_decision',
                        title: 'Final Decision',
                        description: recruiterDecision 
                            ? `The recruiter has marked your application as: ${recruiterDecision}`
                            : (isInterviewDone ? 'The recruiter is currently reviewing your performance and will make a final decision soon.' : 'Reach the final stage by completing your assigned assessments.'),
                        status: recruiterDecision === 'Rejected' ? 'rejected' : (recruiterDecision === 'Hired' || recruiterDecision === 'Shortlisted' ? 'hired' : (isInterviewDone ? 'current' : 'locked'))
                    }
                ];

                return {
                    id: cohort.id,
                    jobTitle: cohort.name,
                    company: "Recruiter Hub",
                    stages,
                    overallStatus: recruiterDecision || 'Active'
                };
            }));
            setApplications(appData);
            setIsLoading(false);
        });

        return () => unsub();
    }, [user, firestore]);

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="relative min-h-full w-full p-4 md:p-8">
            <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.1),rgba(255,255,255,0))]"></div>
            
            <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold mb-8 flex items-center gap-3"
            >
                <Briefcase /> My Applications
            </motion.h1>

            {applications.length === 0 ? (
                <Card className="bg-card/30 border-dashed text-center p-12">
                    <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">You haven't been added to any hiring cohorts yet.</p>
                </Card>
            ) : (
                <div className="grid gap-8">
                    {applications.map((app) => (
                        <Card key={app.id} className="bg-card/60 backdrop-blur-sm border-border/20 shadow-lg">
                            <CardHeader className="border-b pb-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle className="text-2xl">{app.jobTitle}</CardTitle>
                                        <CardDescription>{app.company}</CardDescription>
                                    </div>
                                    <Badge variant={app.overallStatus === 'Rejected' ? 'destructive' : (app.overallStatus === 'Hired' || app.overallStatus === 'Shortlisted' ? 'default' : 'secondary')}>
                                        {app.overallStatus}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-8">
                                <div className="relative">
                                    {/* Vertical Connector Line */}
                                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border -z-10" />
                                    
                                    <div className="space-y-12">
                                        {app.stages.map((stage: ApplicationStage, idx: number) => (
                                            <div key={stage.id} className="flex gap-6 relative">
                                                <div className={cn(
                                                    "h-12 w-12 rounded-full flex items-center justify-center shrink-0 border-4 bg-background",
                                                    (stage.status === 'completed' || stage.status === 'hired') ? "border-green-500 text-green-500" :
                                                    stage.status === 'rejected' ? "border-red-500 text-red-500" :
                                                    stage.status === 'current' ? "border-primary text-primary animate-pulse" :
                                                    stage.status === 'pending' ? "border-amber-500 text-amber-500" :
                                                    "border-muted text-muted-foreground"
                                                )}>
                                                    {(stage.status === 'completed' || stage.status === 'hired') ? <CheckCircle2 /> : 
                                                     stage.status === 'rejected' ? <XCircle /> :
                                                     stage.status === 'current' ? <Play className="h-5 w-5 fill-current" /> :
                                                     stage.status === 'pending' ? <Clock /> : <Lock className="h-5 w-5" />}
                                                </div>
                                                
                                                <div className="flex-grow pt-1">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h3 className={cn(
                                                                "text-xl font-bold",
                                                                stage.status === 'locked' && "text-muted-foreground",
                                                                stage.status === 'rejected' && "text-red-500"
                                                            )}>{stage.title}</h3>
                                                            <p className="text-muted-foreground text-sm max-w-md">{stage.description}</p>
                                                        </div>
                                                        {stage.actionLabel && stage.actionLink && (
                                                            <Button asChild>
                                                                <Link href={stage.actionLink}>
                                                                    {stage.actionLabel} <ChevronRight className="ml-2 h-4 w-4" />
                                                                </Link>
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
