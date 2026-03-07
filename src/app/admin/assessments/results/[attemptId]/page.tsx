
'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { AssessmentAttempt, Role, Question, UserResponse, VoiceInterviewAttempt } from '@/lib/types';
import { Loader2, ArrowLeft, Download, BarChart, BrainCircuit, CheckCircle, XCircle, Terminal, Mic } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, PolarRadiusAxis, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CodeEditor } from '@/components/assessment/CodeEditor';
import { cn } from '@/lib/utils';

export default function AdminAssessmentResultPage() {
    const { user } = useAuth();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { firestore } = initializeFirebase();
    
    const [currentAttempt, setCurrentAttempt] = useState<any>(null);
    const [interviewAttempt, setInterviewAttempt] = useState<VoiceInterviewAttempt | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const attemptId = params.attemptId as string;
    const userId = searchParams.get('userId');

    useEffect(() => {
        if (!userId || !firestore || !attemptId) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch Tech Attempt
                const techSnap = await getDoc(doc(firestore, 'users', userId, 'assessments', attemptId));
                if (techSnap.exists()) {
                    const techData = techSnap.data() as AssessmentAttempt;
                    setCurrentAttempt(techData);

                    // Fetch Interview Attempt for this candidate if it exists
                    const interviewQ = query(collection(firestore, 'interviewAttempts'), where('candidateId', '==', userId), orderBy('completedAt', 'desc'));
                    const interviewSnap = await getDocs(interviewQ);
                    if (!interviewSnap.empty) {
                        setInterviewAttempt(interviewSnap.docs[0].data() as VoiceInterviewAttempt);
                    }
                }
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [userId, firestore, attemptId]);

    const radarData = useMemo(() => {
        if (!interviewAttempt?.evaluation) return [];
        const { overall_scores } = interviewAttempt.evaluation;
        return [
            { subject: 'Technical', A: overall_scores.technical_knowledge * 10, fullMark: 100 },
            { subject: 'Communication', A: overall_scores.communication * 10, fullMark: 100 },
            { subject: 'Confidence', A: overall_scores.confidence * 10, fullMark: 100 },
        ];
    }, [interviewAttempt]);

    if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2" /> Back</Button>
                <h1 className="text-4xl font-bold">Candidate Report</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card/60 backdrop-blur-sm border-border/20 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary"><BarChart className="h-5 w-5" /> Technical Assessment</CardTitle>
                        <CardDescription>MCQ & Coding Results</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center py-12">
                        <p className="text-sm text-muted-foreground uppercase tracking-widest font-bold mb-2">Final Score</p>
                        <p className="text-8xl font-black text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.3)]">{Math.round(currentAttempt?.finalScore || 0)}%</p>
                    </CardContent>
                </Card>

                {interviewAttempt && interviewAttempt.status === 'evaluated' && (
                    <Card className="bg-card/60 backdrop-blur-sm border-border/20 shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-primary"><Mic className="h-5 w-5" /> AI Voice Interview</CardTitle>
                            <CardDescription>Multi-dimensional verbal skills report</CardDescription>
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
                )}
            </div>

            {interviewAttempt?.evaluation && (
                <Card className="bg-primary/5 border-primary/20 shadow-xl">
                    <CardHeader className="bg-primary/10 border-b border-primary/20">
                        <CardTitle className="flex items-center gap-2 text-primary"><BrainCircuit className="h-6 w-6" /> Detailed Interview Evaluation</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                        <div className="p-6 bg-background/50 rounded-xl border border-primary/20 shadow-inner">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">AI Recommendation</p>
                                    <p className={cn(
                                        "text-3xl font-black mt-1",
                                        interviewAttempt.evaluation.final_recommendation === 'Strong Hire' ? 'text-green-500' : 
                                        interviewAttempt.evaluation.final_recommendation === 'Reject' ? 'text-red-500' : 'text-amber-500'
                                    )}>{interviewAttempt.evaluation.final_recommendation}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">Avg Score</p>
                                    <p className="text-3xl font-black mt-1">{interviewAttempt.evaluation.overall_scores.technical_knowledge}/10</p>
                                </div>
                            </div>
                            <Separator className="my-4 bg-primary/10" />
                            <p className="text-lg leading-relaxed text-foreground/90 italic">"{interviewAttempt.evaluation.summary}"</p>
                        </div>
                        
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Mic className="h-5 w-5 text-primary" /> Transcription & Per-Question Analysis</h3>
                            <div className="grid grid-cols-1 gap-6">
                                {interviewAttempt.evaluation.evaluation.map((ev, i) => (
                                    <Card key={i} className="overflow-hidden border-border/40 hover:border-primary/40 transition-colors shadow-sm">
                                        <div className="bg-muted/30 p-4 border-b">
                                            <span className="text-xs font-bold text-muted-foreground uppercase">Question {i + 1}</span>
                                            <p className="text-lg font-bold mt-1 text-foreground">{ev.question}</p>
                                        </div>
                                        <CardContent className="p-5 space-y-4 bg-background">
                                            <div className="p-4 bg-secondary/20 rounded-lg border-l-4 border-primary italic text-foreground/80">
                                                "{interviewAttempt.transcripts[i] || 'Candidate provided no verbal response.'}"
                                            </div>
                                            <div className="flex flex-wrap gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Technical</p>
                                                    <Badge variant="outline" className="text-sm font-bold border-primary/20">{ev.technical_score}/10</Badge>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Communication</p>
                                                    <Badge variant="outline" className="text-sm font-bold border-primary/20">{ev.communication_score}/10</Badge>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Confidence</p>
                                                    <Badge variant="outline" className="text-sm font-bold border-primary/20">{ev.confidence_score}/10</Badge>
                                                </div>
                                            </div>
                                            <div className="pt-2">
                                                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">AI Feedback</p>
                                                <p className="text-sm text-foreground/80">{ev.remarks}</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
