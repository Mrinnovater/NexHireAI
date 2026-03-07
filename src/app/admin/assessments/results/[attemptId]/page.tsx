
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

                    // Fetch Interview Attempt for this cohort if it exists
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
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BarChart /> Technical Assessment</CardTitle>
                        <CardDescription>MCQ & Coding Results</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center py-12">
                        <p className="text-sm text-muted-foreground">Final Score</p>
                        <p className="text-7xl font-bold text-primary">{Math.round(currentAttempt?.finalScore || 0)}%</p>
                    </CardContent>
                </Card>

                {interviewAttempt && interviewAttempt.status === 'evaluated' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Mic /> AI Voice Interview</CardTitle>
                            <CardDescription>Evaluation of verbal skills and confidence</CardDescription>
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
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BrainCircuit /> AI Interview Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-background rounded-lg border">
                            <p className="font-semibold text-lg mb-2">Recommendation: <span className={cn(
                                interviewAttempt.evaluation.final_recommendation === 'Strong Hire' ? 'text-green-500' : 
                                interviewAttempt.evaluation.final_recommendation === 'Reject' ? 'text-red-500' : 'text-amber-500'
                            )}>{interviewAttempt.evaluation.final_recommendation}</span></p>
                            <p className="text-muted-foreground leading-relaxed">{interviewAttempt.evaluation.summary}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {interviewAttempt.evaluation.evaluation.map((ev, i) => (
                                <div key={i} className="p-3 border rounded-md text-sm space-y-1">
                                    <p className="font-bold">Q: {ev.question}</p>
                                    <p className="text-muted-foreground italic">"{interviewAttempt.transcripts[i]}"</p>
                                    <div className="flex gap-4 pt-2 border-t mt-2">
                                        <Badge variant="outline">Tech: {ev.technical_score}/10</Badge>
                                        <Badge variant="outline">Comm: {ev.communication_score}/10</Badge>
                                    </div>
                                    <p className="text-xs pt-1">{ev.remarks}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
