
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, onSnapshot, getDoc, doc, where, getDocs, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Cohort, User, AssessmentAttempt, CandidateStatus, JobPosition, InterviewQuestionBank, VoiceInterviewAttempt } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Crown, Medal, Gem, Users, Eye, BarChart, User as UserIcon, Mic, Send, PlusCircle, BrainCircuit, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, PolarRadiusAxis } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

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
    
    // Report State
    const [selectedInterview, setSelectedInterview] = useState<VoiceInterviewAttempt | null>(null);

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
        const interviewData = interviewSnap.docs.map(d => ({ id: d.id, ...d.data() } as VoiceInterviewAttempt));

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

    const radarData = useMemo(() => {
        if (!selectedInterview?.evaluation) return [];
        const { overall_scores } = selectedInterview.evaluation;
        return [
            { subject: 'Technical', A: overall_scores.technical_knowledge * 10 },
            { subject: 'Communication', A: overall_scores.communication * 10 },
            { subject: 'Confidence', A: overall_scores.confidence * 10 },
        ];
    }, [selectedInterview]);

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
                                    <TableCell className="text-center">
                                        {entry.tech ? (
                                            <Button variant="ghost" onClick={() => router.push(`/admin/assessments/results/${entry.tech.docId}?userId=${entry.user.id}`)} className="h-auto p-1">
                                                <Badge variant="outline" className="text-lg py-1 px-3">
                                                    {Math.round(entry.tech.finalScore)}%
                                                </Badge>
                                            </Button>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {entry.interview ? (
                                            <Button 
                                                variant="ghost" 
                                                className="h-auto p-1" 
                                                onClick={() => setSelectedInterview(entry.interview)}
                                                disabled={entry.interview.status !== 'evaluated'}
                                            >
                                                <Badge variant={entry.interview.status === 'evaluated' ? 'default' : 'secondary'} className="text-sm">
                                                    {entry.interview.status === 'evaluated' ? `${entry.interview.evaluation.overall_scores.technical_knowledge}/10` : entry.interview.status}
                                                </Badge>
                                            </Button>
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

            {/* Detailed Interview Report Dialog */}
            <Dialog open={!!selectedInterview} onOpenChange={(open) => !open && setSelectedInterview(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-secondary/30">
                        <DialogTitle className="text-2xl flex items-center gap-2">
                            <BrainCircuit className="text-primary h-6 w-6" />
                            Interview Report: {selectedInterview?.candidateName}
                        </DialogTitle>
                        <DialogDescription>AI-generated technical and communication evaluation</DialogDescription>
                    </DialogHeader>
                    
                    <ScrollArea className="flex-grow">
                        <div className="p-6 space-y-8">
                            {/* Summary Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                <Card className="bg-primary/5 border-primary/20">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Overall Performance</CardTitle>
                                    </CardHeader>
                                    <CardContent className="h-[250px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                                <PolarGrid />
                                                <PolarAngleAxis dataKey="subject" />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                                                <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>

                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase font-bold">Recommendation</Label>
                                        <div className="mt-1">
                                            <Badge className={cn(
                                                "text-lg px-4 py-1",
                                                selectedInterview?.evaluation?.final_recommendation === 'Strong Hire' ? 'bg-green-500' :
                                                selectedInterview?.evaluation?.final_recommendation === 'Reject' ? 'bg-red-500' : 'bg-amber-500'
                                            )}>
                                                {selectedInterview?.evaluation?.final_recommendation}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground text-xs uppercase font-bold">Executive Summary</Label>
                                        <p className="mt-2 text-sm leading-relaxed text-foreground/90 bg-muted/30 p-4 rounded-lg border">
                                            {selectedInterview?.evaluation?.summary}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Q&A Breakdown */}
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold flex items-center gap-2"><Mic className="h-5 w-5" /> Question Breakdown</h3>
                                <div className="grid gap-4">
                                    {selectedInterview?.evaluation?.evaluation.map((ev, i) => (
                                        <Card key={i} className="overflow-hidden">
                                            <div className="bg-muted/50 p-4 border-b">
                                                <p className="font-bold text-sm">Question {i + 1}</p>
                                                <p className="text-lg mt-1">{ev.question}</p>
                                            </div>
                                            <CardContent className="p-4 space-y-4">
                                                <div className="bg-background border rounded-lg p-3 italic text-sm text-muted-foreground">
                                                    "{selectedInterview.transcripts[i] || 'No verbal answer recorded.'}"
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                    <Badge variant="outline" className="gap-1">Technical: <span className="font-bold text-primary">{ev.technical_score}/10</span></Badge>
                                                    <Badge variant="outline" className="gap-1">Communication: <span className="font-bold text-primary">{ev.communication_score}/10</span></Badge>
                                                    <Badge variant="outline" className="gap-1">Confidence: <span className="font-bold text-primary">{ev.confidence_score}/10</span></Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground bg-muted/20 p-2 rounded">
                                                    <span className="font-bold uppercase mr-2">AI Remarks:</span> {ev.remarks}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    
                    <DialogFooter className="p-6 bg-secondary/30">
                        <Button variant="ghost" onClick={() => setSelectedInterview(null)}>Close Report</Button>
                        <Button onClick={() => router.push(`/admin/candidates/${selectedInterview?.candidateId}`)}>View Full Profile</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Invite Dialog */}
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Job for AI Interview</DialogTitle>
                        <DialogDescription>Candidates will receive questions from the bank associated with this job.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {jobs.length > 0 ? (
                            <Select onValueChange={setSelectedJobId}>
                                <SelectTrigger><SelectValue placeholder="Choose job..." /></SelectTrigger>
                                <SelectContent>
                                    {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.role} ({j.domain})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="text-center py-6 border-2 border-dashed rounded-lg">
                                <p className="text-sm text-muted-foreground mb-4">No jobs created yet.</p>
                                <Button variant="outline" size="sm" onClick={() => router.push('/admin/jobs/new')}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Create Job Position
                                </Button>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleInviteToInterview} disabled={!selectedJobId || jobs.length === 0}>Send Invitations</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
