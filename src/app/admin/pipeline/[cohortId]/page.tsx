
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, onSnapshot, getDoc, doc, where, getDocs, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Cohort, User, AssessmentAttempt, CandidateStatus, JobPosition, InterviewQuestionBank, VoiceInterviewAttempt } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Crown, Medal, Gem, Users, Eye, BarChart, User as UserIcon, Mic, Send, PlusCircle, BrainCircuit, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
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
import { Label } from '@/components/ui/label';

export default function LeaderboardPage() {
    const { firestore } = initializeFirebase();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const cohortId = params.cohortId as string;

    const [cohort, setCohort] = useState<Cohort | null>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    
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

    const handleUpdateStatus = async (candidateId: string, newStatus: string) => {
        if (!firestore || !cohort) return;
        setIsUpdatingStatus(candidateId);
        try {
            const updatedStatuses = { ...(cohort.statuses || {}), [candidateId]: newStatus };
            await updateDoc(doc(firestore, 'cohorts', cohort.id), {
                statuses: updatedStatuses
            });
            toast({ title: "Status Updated", description: `Candidate marked as ${newStatus}.` });
        } catch (error) {
            toast({ title: "Update Failed", variant: "destructive" });
        } finally {
            setIsUpdatingStatus(null);
        }
    };

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
                                <TableHead className="text-center">Decision</TableHead>
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
                                    <TableCell className="text-center">
                                        <Select 
                                            value={entry.status} 
                                            onValueChange={(val) => handleUpdateStatus(entry.user.id, val)}
                                            disabled={isUpdatingStatus === entry.user.id}
                                        >
                                            <SelectTrigger className={cn(
                                                "w-[140px] mx-auto h-8 text-xs font-bold uppercase tracking-tighter",
                                                entry.status === 'Shortlisted' && "bg-green-500/10 text-green-500 border-green-500/20",
                                                entry.status === 'Waiting' && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                                                entry.status === 'Rejected' && "bg-red-500/10 text-red-500 border-red-500/20",
                                                entry.status === 'Hired' && "bg-primary/10 text-primary border-primary/20"
                                            )}>
                                                {isUpdatingStatus === entry.user.id ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : <SelectValue />}
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Under Review">Under Review</SelectItem>
                                                <SelectItem value="Shortlisted" className="text-green-500">Shortlisted</SelectItem>
                                                <SelectItem value="Waiting" className="text-amber-500">Waiting</SelectItem>
                                                <SelectItem value="Rejected" className="text-red-500">Rejected</SelectItem>
                                                <SelectItem value="Hired">Mark as Hired</SelectItem>
                                            </SelectContent>
                                        </Select>
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
                <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-primary/20">
                    <DialogHeader className="p-8 bg-secondary/30 flex-shrink-0 border-b">
                        <div className="flex items-center gap-4">
                            <div className="bg-primary/10 p-3 rounded-full border border-primary/20">
                                <BrainCircuit className="text-primary h-8 w-8" />
                            </div>
                            <div>
                                <DialogTitle className="text-3xl font-black tracking-tighter">
                                    Interview Report: {selectedInterview?.candidateName}
                                </DialogTitle>
                                <DialogDescription className="text-base font-medium">AI-generated evaluation for {selectedInterview?.jobTitle}</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-grow overflow-hidden flex flex-col">
                        <ScrollArea className="flex-grow">
                            <div className="p-8 space-y-10 pb-20">
                                {/* Summary Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                    <Card className="lg:col-span-1 bg-primary/5 border-primary/20">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Competency Map</CardTitle>
                                        </CardHeader>
                                        <CardContent className="h-[280px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                                    <PolarGrid />
                                                    <PolarAngleAxis dataKey="subject" tick={{fontSize: 10, fontWeight: 700}} />
                                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                    <Radar name="Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>

                                    <div className="lg:col-span-2 space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-5 bg-muted/30 rounded-2xl border-2 border-dashed">
                                                <Label className="text-muted-foreground text-[10px] uppercase font-black tracking-widest">AI Recommendation</Label>
                                                <div className="mt-2 flex items-center gap-3">
                                                    <div className={cn(
                                                        "h-4 w-4 rounded-full animate-pulse",
                                                        selectedInterview?.evaluation?.final_recommendation === 'Strong Hire' ? 'bg-green-500' :
                                                        selectedInterview?.evaluation?.final_recommendation === 'Reject' ? 'bg-red-500' : 'bg-amber-500'
                                                    )} />
                                                    <span className={cn(
                                                        "text-3xl font-black tracking-tighter",
                                                        selectedInterview?.evaluation?.final_recommendation === 'Strong Hire' ? 'text-green-500' :
                                                        selectedInterview?.evaluation?.final_recommendation === 'Reject' ? 'text-red-500' : 'text-amber-500'
                                                    )}>
                                                        {selectedInterview?.evaluation?.final_recommendation}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10">
                                                <Label className="text-muted-foreground text-[10px] uppercase font-black tracking-widest">Avg Tech Depth</Label>
                                                <p className="text-3xl font-black text-primary mt-2">{selectedInterview?.evaluation?.overall_scores.technical_knowledge}/10</p>
                                            </div>
                                        </div>
                                        
                                        <div className="p-6 bg-background rounded-2xl border-l-8 border-primary shadow-xl ring-1 ring-primary/5">
                                            <Label className="text-muted-foreground text-[10px] uppercase font-black mb-3 block tracking-widest">Executive Summary</Label>
                                            <p className="text-xl leading-relaxed text-foreground/90 italic font-medium">
                                                "{selectedInterview?.evaluation?.summary}"
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <Separator className="bg-primary/5 h-px" />

                                {/* Q&A Breakdown */}
                                <div className="space-y-8">
                                    <h3 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                                        <MessageSquare className="h-8 w-8 text-primary" />
                                        Evidence & Transcripts
                                    </h3>
                                    <div className="grid gap-8">
                                        {selectedInterview?.evaluation?.evaluation.map((ev, i) => (
                                            <Card key={i} className="overflow-hidden border-primary/10 shadow-2xl hover:border-primary/30 transition-all group">
                                                <div className="bg-secondary/20 p-6 border-b flex justify-between items-start gap-4">
                                                    <div className="flex-grow">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <Badge className="bg-primary text-primary-foreground font-black px-3">QUESTION {i + 1}</Badge>
                                                            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/20">{selectedInterview.selectedQuestions[i]?.topic || 'Technical'}</Badge>
                                                        </div>
                                                        <p className="text-2xl font-bold text-foreground leading-tight tracking-tight">{ev.question}</p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <div className="p-3 bg-background rounded-2xl border-2 border-primary/20 text-center min-w-[100px] shadow-lg">
                                                            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Verdict</p>
                                                            <p className="text-2xl font-black text-primary">{ev.technical_score}/10</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <CardContent className="p-8 space-y-8 bg-card">
                                                    <div className="relative">
                                                        <Label className="text-[10px] font-black uppercase text-primary mb-3 block tracking-widest">Spoken Response (Transcript)</Label>
                                                        <div className="bg-muted/30 border-2 border-dashed rounded-2xl p-6 italic text-lg text-foreground/80 leading-relaxed shadow-inner font-medium relative group-hover:bg-muted/50 transition-colors">
                                                            <div className="absolute -top-3 -left-3 bg-primary/10 p-2 rounded-full border border-primary/20"><Mic className="h-4 w-4 text-primary" /></div>
                                                            "{selectedInterview.transcripts[i] || 'Candidate remained silent or microphone failed during this prompt.'}"
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                        <MetricBox label="Technical Depth" value={ev.technical_score} />
                                                        <MetricBox label="Articulation" value={ev.communication_score} />
                                                        <MetricBox label="Confidence" value={ev.confidence_score} />
                                                    </div>

                                                    <div className="p-6 bg-primary/5 rounded-2xl border-2 border-primary/10 relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 h-24 w-24 bg-primary/5 rounded-full -mr-12 -mt-12" />
                                                        <Label className="text-[10px] font-black uppercase text-primary mb-3 block tracking-widest flex items-center gap-2">
                                                            <BrainCircuit className="h-3 w-3" /> AI Feedback & Observations
                                                        </Label>
                                                        <p className="text-base text-foreground/90 font-semibold leading-relaxed relative z-10">{ev.remarks}</p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter className="p-8 bg-secondary/30 flex-shrink-0 border-t flex justify-between items-center sm:justify-between shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                        <Button variant="ghost" className="font-black uppercase text-xs tracking-widest hover:bg-destructive/10 hover:text-destructive" onClick={() => setSelectedInterview(null)}>Close Session Report</Button>
                        <div className="flex gap-4">
                            <Button variant="outline" className="font-bold h-12 px-6" onClick={() => window.print()}>Export to PDF</Button>
                            <Button className="font-bold h-12 px-8 shadow-xl shadow-primary/20" onClick={() => router.push(`/admin/candidates/${selectedInterview?.candidateId}`)}>Review Full Profile</Button>
                        </div>
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

const MetricBox = ({ label, value }: { label: string, value: number }) => (
    <div className="p-4 border-2 rounded-2xl bg-background text-center shadow-lg transition-transform hover:scale-105">
        <p className="text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-tighter">{label}</p>
        <div className="flex items-center justify-center gap-1">
            <span className="text-3xl font-black text-foreground tracking-tighter">{value}</span>
            <span className="text-xs font-bold text-muted-foreground">/10</span>
        </div>
    </div>
);
