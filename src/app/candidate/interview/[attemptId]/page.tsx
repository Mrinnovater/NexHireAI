
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
    
    // Live Transcript Management
    const [liveTranscript, setLiveTranscript] = useState('');
    const finalTranscriptRef = useRef(''); // Stores only 'isFinal' segments
    
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

    // Initialize Speech Recognition with Robust Repetition-Fixing Logic
    useEffect(() => {
        if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            const recognition = new SpeechRecognition();
            
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                // We don't clear finalTranscriptRef here because it accumulates 'isFinal' segments
                
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptSegment = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscriptRef.current += transcriptSegment + ' ';
                    } else {
                        interimTranscript += transcriptSegment;
                    }
                }
                
                // The UI shows the committed text + the currently being processed guess
                setLiveTranscript((finalTranscriptRef.current + interimTranscript).trim());
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
        // Reset buffers for new question
        finalTranscriptRef.current = '';
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
        
        // Save the cleaned transcript
        const cleanedText = liveTranscript.trim();
        setTranscripts(prev => {
            const next = [...prev];
            next[currentIdx] = cleanedText;
            return next;
        });
    };

    const nextQuestion = () => {
        if (currentIdx < attempt.selectedQuestions.length - 1) {
            setCurrentIdx(prev => prev + 1);
            setLiveTranscript('');
            finalTranscriptRef.current = '';
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
                <Card className="max-w-md w-full border-primary/20 shadow-2xl">
                    <CardHeader>
                        <CardTitle>Ready for your AI Interview?</CardTitle>
                        <CardDescription>Job: {attempt.jobTitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-muted rounded-xl space-y-2 text-sm border">
                            <p className="flex items-center gap-2 font-medium"><Mic className="h-4 w-4 text-primary" /> 5 verbal questions</p>
                            <p className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-primary" /> 120 seconds per answer</p>
                            <p className="flex items-center gap-2 font-medium text-amber-500"><AlertCircle className="h-4 w-4" /> Anti-cheating monitoring enabled</p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full font-bold h-12" onClick={() => setStatus('active')}>Start Interview</Button>
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
                <Card className="max-w-md w-full text-center border-green-500/30">
                    <CardHeader>
                        <div className="h-16 w-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Send className="text-green-500 h-8 w-8" />
                        </div>
                        <CardTitle className="text-2xl">Interview Complete!</CardTitle>
                        <CardDescription>Your performance has been evaluated and sent to the recruiter.</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button className="w-full font-bold" onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    const currentQuestion = attempt.selectedQuestions[currentIdx];

    return (
        <div className="min-h-screen bg-secondary/30 flex flex-col">
            <div className="p-4 border-b bg-background flex justify-between items-center shadow-sm">
                <div className="font-black text-xl tracking-tighter">QUESTION {currentIdx + 1} <span className="text-muted-foreground font-normal">OF 5</span></div>
                <div className="flex items-center gap-4">
                    <div className={`px-4 py-1.5 rounded-full text-sm font-black font-mono transition-colors ${timeLeft < 20 ? 'bg-destructive text-destructive-foreground animate-pulse' : 'bg-primary/10 text-primary border border-primary/20'}`}>
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
                        <Card className="shadow-2xl border-primary/10 overflow-hidden">
                            <CardHeader className="text-center bg-secondary/20 pb-8 pt-10">
                                <Badge className="w-fit mx-auto mb-4 uppercase font-black tracking-widest px-3" variant="secondary">{currentQuestion.topic}</Badge>
                                <CardTitle className="text-3xl md:text-4xl leading-tight font-black tracking-tight">{currentQuestion.question}</CardTitle>
                                <Button variant="ghost" size="sm" onClick={speakQuestion} className="mt-4 font-bold text-primary hover:bg-primary/5">
                                    <Volume2 className="h-4 w-4 mr-2" /> Speak Question
                                </Button>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center py-12 bg-card">
                                <Waveform isRecording={isRecording} />
                                
                                {/* Clean Live Transcript Preview */}
                                <div className="mt-10 w-full max-w-xl">
                                    <div className="p-6 bg-muted/30 rounded-2xl border-2 border-dashed border-primary/10 flex items-start gap-4 min-h-[140px] transition-all hover:bg-muted/50">
                                        <MessageSquareText className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                                        <div className="flex-grow">
                                            <p className="text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-widest">Live Transcription Service</p>
                                            <p className="text-lg italic text-foreground/90 leading-relaxed font-medium">
                                                {liveTranscript || (isRecording ? "Listening closely..." : "Your spoken answer will appear here correctly...")}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-12">
                                    {!isRecording ? (
                                        <Button size="lg" className="rounded-full h-28 w-28 shadow-2xl shadow-primary/40 transition-transform active:scale-95" onClick={startRecording}>
                                            <Mic className="h-12 w-12" />
                                        </Button>
                                    ) : (
                                        <Button size="lg" variant="destructive" className="rounded-full h-28 w-28 animate-pulse shadow-2xl shadow-destructive/40" onClick={stopRecording}>
                                            <MicOff className="h-12 w-12" />
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-6 text-sm text-muted-foreground font-black uppercase tracking-widest">
                                    {isRecording ? "Recording in progress" : "Click mic to start"}
                                </p>
                            </CardContent>
                            <CardFooter className="justify-between border-t bg-secondary/10 px-8 py-6">
                                <div className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                                    Security Status: {tabSwitches > 0 ? <span className="text-amber-500">{tabSwitches} interruptions</span> : <span className="text-green-500">Secure Session</span>}
                                </div>
                                <Button disabled={isRecording || !liveTranscript} onClick={nextQuestion} className="font-bold px-8">
                                    {currentIdx === 4 ? "Submit Interview" : "Next Question"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
