
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, onSnapshot, getDoc, doc, where, getDocs, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Cohort, User, AssessmentAttempt, CandidateStatus, JobPosition, InterviewQuestionBank } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Crown, Medal, Gem, Users, Eye, BarChart, User as UserIcon, Mic, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LeaderboardPage() {
    const { firestore } = initializeFirebase();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const cohortId = params.cohortId as string;

    const [cohort, setCohort] = useState<Cohort | null>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Job/Interview State
    const [jobs, setJobs] = useState<JobPosition[]>([]);
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [selectedJobId, setSelectedJobId] = useState('');

    useEffect(() => {
        if (!firestore) return;
        const fetchJobs = async () => {
            const q = query(collection(firestore, 'jobs'));
            const snap = await getDocs(q);
            setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosition)));
        };
        fetchJobs();
    }, [firestore]);

    const fetchLeaderboard = useCallback(async (cohortData: Cohort) => {
        if (!firestore) return;
        const usersQuery = query(collection(firestore, 'users'), where('__name__', 'in', cohortData.candidateIds));
        const usersSnap = await getDocs(usersQuery);
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));

        // Fetch technical attempts
        let techAttempts: AssessmentAttempt[] = [];
        if (cohortData.assignedAssessmentId) {
            const promises = cohortData.candidateIds.map(async id => {
                const q = query(collection(firestore, `users/${id}/assessments`), where('rootAssessmentId', '==', cohortData.assignedAssessmentId));
                const snap = await getDocs(q);
                return snap.empty ? null : { ...snap.docs[0].data(), docId: snap.docs[0].id } as AssessmentAttempt;
            });
            const res = await Promise.all(promises);
            techAttempts = res.filter(Boolean) as AssessmentAttempt[];
        }

        // Fetch Interview Attempts
        const interviewQuery = query(collection(firestore, 'interviewAttempts'), where('cohortId', '==', cohortData.id));
        const interviewSnap = await getDocs(interviewQuery);
        const interviewData = interviewSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const entries = users.map(user => {
            const tech = techAttempts.find(a => a.userId === user.id);
            const interview = interviewData.find(a => a.candidateId === user.id);
            return { user, tech, interview, status: cohortData.statuses?.[user.id] || (tech ? 'Under Review' : 'Yet to Take') };
        });

        entries.sort((a, b) => (b.tech?.finalScore ?? -1) - (a.tech?.finalScore ?? -1));
        setLeaderboard(entries);
    }, [firestore]);

    useEffect(() => {
        if (!firestore || !cohortId) return;
        const unsub = onSnapshot(doc(firestore, 'cohorts', cohortId), (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as Cohort;
                setCohort(data);
                fetchLeaderboard(data).finally(() => setIsLoading(false));
            }
        });
        return () => unsub();
    }, [firestore, cohortId, fetchLeaderboard]);

    const handleInviteToInterview = async () => {
        if (!firestore || !cohort || !selectedJobId) return;
        const job = jobs.find(j => j.id === selectedJobId);
        if (!job) return;

        try {
            const bankSnap = await getDoc(doc(firestore, 'questionBanks', job.questionBankId));
            if (!bankSnap.exists()) throw new Error("Question bank not found.");
            const bank = bankSnap.data() as InterviewQuestionBank;

            const batch = leaderboard.map(async (entry) => {
                // Randomly select 5 questions per candidate
                const selected = [...bank.questions].sort(() => 0.5 - Math.random()).slice(0, 5);
                const attemptRef = doc(collection(firestore, 'interviewAttempts'));
                
                await setDoc(attemptRef, {
                    candidateId: entry.user.id,
                    candidateName: entry.user.name,
                    candidateEmail: entry.user.email,
                    jobPositionId: job.id,
                    jobTitle: job.role,
                    cohortId: cohort.id,
                    status: 'pending',
                    selectedQuestions: selected,
                    transcripts: [],
                    startedAt: 0,
                    antiCheating: { tabSwitchCount: 0, speechDuration: [] }
                });

                // Notify candidate
                const notifRef = doc(collection(firestore, `users/${entry.user.id}/notifications`));
                await setDoc(notifRef, {
                    title: "Shortlisted for AI Interview",
                    message: `You've been invited to an AI Voice Interview for the ${job.role} position.`,
                    link: `/candidate/interview/${attemptRef.id}`,
                    isRead: false,
                    createdAt: Date.now()
                });
            });

            await Promise.all(batch);
            toast({ title: "Invitations Sent", description: "All candidates have been notified." });
            setIsInviteDialogOpen(false);
        } catch (error) {
            toast({ title: "Failed to Invite", variant: "destructive" });
        }
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <Button variant="ghost" onClick={() => router.back()} className="mb-2"><ArrowLeft className="mr-2" /> Back</Button>
                    <h1 className="text-4xl font-bold">Cohort: {cohort?.name}</h1>
                </div>
                <Button onClick={() => setIsInviteDialogOpen(true)}>
                    <Mic className="mr-2" /> Invite to AI Interview
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Candidate</TableHead>
                                <TableHead className="text-center">Tech Score</TableHead>
                                <TableHead className="text-center">AI Interview</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {leaderboard.map((entry) => (
                                <TableRow key={entry.user.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar>
                                                <AvatarImage src={entry.user.avatarUrl} />
                                                <AvatarFallback>{entry.user.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium">{entry.user.name}</p>
                                                <p className="text-xs text-muted-foreground">{entry.user.email}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-bold">
                                        {entry.tech ? `${Math.round(entry.tech.finalScore)}%` : '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {entry.interview ? (
                                            <Badge variant={entry.interview.status === 'evaluated' ? 'default' : 'secondary'}>
                                                {entry.interview.status === 'evaluated' ? `${entry.interview.evaluation.overall_scores.technical_knowledge}/10` : entry.interview.status}
                                            </Badge>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/candidates/${entry.user.id}`)}>View Profile</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Job for AI Interview</DialogTitle>
                        <DialogDescription>Candidates will receive questions from the bank associated with this job.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select onValueChange={setSelectedJobId}>
                            <SelectTrigger><SelectValue placeholder="Choose job..." /></SelectTrigger>
                            <SelectContent>
                                {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.role} ({j.domain})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleInviteToInterview} disabled={!selectedJobId}>Send Invitations</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
