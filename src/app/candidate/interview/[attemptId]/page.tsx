
'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Play, Send, Loader2, AlertCircle, Volume2, MessageSquareText } from 'lucide-react';
import { Waveform } from '@/components/interview/Waveform';
import { evaluateVoiceInterview } from '@/ai/flows/evaluate-voice-interview-flow';
import { motion, AnimatePresence } from 'framer-motion';

export default function InterviewRoom() {
    const { attemptId } = useParams();
    const router = useRouter();
    const { firestore } = initializeFirebase();
    const { user } = useAuth();
    const { toast } = useToast();

    // Data State
    const [attempt, setAttempt] = useState<any>(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [transcripts, setTranscripts] = useState<string[]>([]);
    const [speechDurations, setSpeechDurations] = useState<number[]>([]);
    
    // Interview State
    const [status, setStatus] = useState<'intro' | 'active' | 'submitting' | 'done'>('intro');
    const [isRecording, setIsRecording] = useState(false);
    const [timeLeft, setTimeLeft] = useState(120);
    const [tabSwitches, setTabSwitches] = useState(0);
    
    // Live Transcript Preview (Prevents Repetition Bug)
    const [liveTranscript, setLiveTranscript] = useState('');
    
    // Web Speech API
    const recognitionRef = useRef<any>(null);
    const timerRef = useRef<any>(null);
    const speechStartTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!firestore || !attemptId) return;
        const fetchAttempt = async () => {
            const docSnap = await getDoc(doc(firestore, 'interviewAttempts', attemptId as string));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.status === 'completed' || data.status === 'evaluated') {
                    router.push('/dashboard');
                    return;
                }
                setAttempt({ id: docSnap.id, ...data });
            }
        };
        fetchAttempt();

        const handleVisibilityChange = () => {
            if (document.hidden) setTabSwitches(prev => prev + 1);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [firestore, attemptId, router]);

    // Initialize Speech Recognition with Repetition-Fixing Logic
    useEffect(() => {
        if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            const recognition = new SpeechRecognition();
            
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                // FIXED: Rebuild the entire transcript from the results array 
                // instead of appending chunks to prevent repetition.
                let finalTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    finalTranscript += event.results[i][0].transcript;
                }
                setLiveTranscript(finalTranscript);
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                if (event.error === 'not-allowed') {
                    toast({ title: "Microphone Blocked", description: "Please enable microphone access in your browser settings.", variant: "destructive" });
                }
            };

            recognitionRef.current = recognition;
        }
        
        return () => {
            recognitionRef.current?.stop();
        };
    }, [toast]);

    const startRecording = () => {
        setLiveTranscript('');
        setIsRecording(true);
        setTimeLeft(120);
        speechStartTimeRef.current = Date.now();
        
        try {
            recognitionRef.current?.start();
        } catch (e) {
            console.warn("Recognition already started or failed to start", e);
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    stopRecording();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopRecording = () => {
        setIsRecording(false);
        clearInterval(timerRef.current);
        recognitionRef.current?.stop();
        
        const duration = (Date.now() - speechStartTimeRef.current) / 1000;
        setSpeechDurations(prev => [...prev, duration]);
        
        // Save the current reconstruction to the transcripts array
        setTranscripts(prev => {
            const next = [...prev];
            next[currentIdx] = liveTranscript.trim();
            return next;
        });
    };

    const nextQuestion = () => {
        if (currentIdx < attempt.selectedQuestions.length - 1) {
            setCurrentIdx(prev => prev + 1);
            setLiveTranscript('');
            setTimeLeft(120);
        } else {
            handleSubmit();
        }
    };

    const speakQuestion = () => {
        const msg = new SpeechSynthesisUtterance(attempt.selectedQuestions[currentIdx].question);
        window.speechSynthesis.speak(msg);
    };

    const handleSubmit = async () => {
        setStatus('submitting');
        toast({ title: "Analyzing Interview...", description: "Gemini is evaluating your performance." });
        
        try {
            const qaPairs = attempt.selectedQuestions.map((q: any, i: number) => ({
                question: q.question,
                answer: transcripts[i] || "[No Answer Provided]"
            }));

            const evaluation = await evaluateVoiceInterview({
                role: attempt.jobTitle || "Candidate",
                questions_and_answers: qaPairs
            });

            await updateDoc(doc(firestore, 'interviewAttempts', attempt.id), {
                transcripts,
                completedAt: Date.now(),
                status: 'evaluated',
                antiCheating: {
                    tabSwitchCount: tabSwitches,
                    speechDuration: speechDurations
                },
                evaluation
            });

            setStatus('done');
        } catch (error) {
            console.error(error);
            toast({ title: "Submission Failed", description: "There was an error evaluating your interview. Please try again.", variant: "destructive" });
            setStatus('active');
        }
    };

    if (!attempt) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    if (status === 'intro') {
        return (
            <div className="h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <CardTitle>Ready for your AI Interview?</CardTitle>
                        <CardDescription>Job: {attempt.jobTitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                            <p className="flex items-center gap-2"><Mic className="h-4 w-4 text-primary" /> 5 verbal questions</p>
                            <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-primary" /> 120 seconds per answer</p>
                            <p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-primary" /> Anti-cheating monitoring enabled</p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={() => setStatus('active')}>Start Interview</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (status === 'submitting') {
        return (
            <div className="h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <h2 className="text-2xl font-bold">Finalizing Evaluation...</h2>
                <p className="text-muted-foreground text-center max-w-xs">Our AI is analyzing your technical depth, communication, and confidence.</p>
            </div>
        );
    }

    if (status === 'done') {
        return (
            <div className="h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle>Interview Complete!</CardTitle>
                        <CardDescription>Your performance has been evaluated and sent to the recruiter.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button className="w-full" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    const currentQuestion = attempt.selectedQuestions[currentIdx];

    return (
        <div className="min-h-screen bg-secondary/30 flex flex-col">
            <div className="p-4 border-b bg-background flex justify-between items-center">
                <div className="font-bold text-lg">Question {currentIdx + 1} of 5</div>
                <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-mono ${timeLeft < 20 ? 'bg-destructive/20 text-destructive animate-pulse' : 'bg-muted'}`}>
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                </div>
            </div>

            <div className="flex-grow flex items-center justify-center p-4">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIdx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="max-w-3xl w-full"
                    >
                        <Card className="shadow-xl">
                            <CardHeader className="text-center">
                                <Badge className="w-fit mx-auto mb-2" variant="secondary">{currentQuestion.topic}</Badge>
                                <CardTitle className="text-2xl md:text-3xl leading-tight">{currentQuestion.question}</CardTitle>
                                <Button variant="ghost" size="sm" onClick={speakQuestion} className="mt-2">
                                    <Volume2 className="h-4 w-4 mr-2" /> Listen to Question
                                </Button>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center py-8">
                                <Waveform isRecording={isRecording} />
                                
                                {/* Live Transcript Preview */}
                                <div className="mt-8 w-full max-w-xl">
                                    <div className="p-4 bg-muted/50 rounded-xl border border-dashed flex items-start gap-3 min-h-24">
                                        <MessageSquareText className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                                        <div className="flex-grow">
                                            <p className="text-xs font-bold uppercase text-muted-foreground mb-1 tracking-tighter">Live Transcription</p>
                                            <p className="text-sm italic text-foreground/80 leading-relaxed">
                                                {liveTranscript || (isRecording ? "Listening..." : "Your spoken answer will appear here...")}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    {!isRecording ? (
                                        <Button size="lg" className="rounded-full h-24 w-24 shadow-lg shadow-primary/20" onClick={startRecording}>
                                            <Mic className="h-10 w-10" />
                                        </Button>
                                    ) : (
                                        <Button size="lg" variant="destructive" className="rounded-full h-24 w-24 animate-pulse" onClick={stopRecording}>
                                            <MicOff className="h-10 w-10" />
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-4 text-sm text-muted-foreground font-medium">
                                    {isRecording ? "Recording... Click to stop" : "Click the mic to start speaking"}
                                </p>
                            </CardContent>
                            <CardFooter className="justify-between border-t mt-4 pt-6">
                                <div className="text-xs text-muted-foreground">
                                    Security: {tabSwitches > 0 ? `${tabSwitches} tab switches detected` : 'Stable Session'}
                                </div>
                                <Button disabled={isRecording || !liveTranscript} onClick={nextQuestion}>
                                    {currentIdx === 4 ? "Finish Interview" : "Next Question"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
