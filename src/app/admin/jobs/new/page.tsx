
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, doc, setDoc, addDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { generateInterviewBank } from '@/ai/flows/generate-interview-bank-flow';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, Wand2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ReactSelect from 'react-select';
import { skillsOptions } from '@/components/profile/profile-options';

const jobSchema = z.object({
    role: z.string().min(3, 'Role is required'),
    domain: z.string().min(3, 'Domain is required'),
    topics: z.array(z.string()).min(1, 'Select at least one topic'),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    n: z.number().min(5).max(50),
});

type JobFormData = z.infer<typeof jobSchema>;

export default function CreateJobPage() {
    const { firestore } = initializeFirebase();
    const { user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);

    const { register, handleSubmit, control, watch, formState: { errors } } = useForm<JobFormData>({
        resolver: zodResolver(jobSchema),
        defaultValues: { difficulty: 'medium', n: 15, topics: [] }
    });

    const onGenerate = async (data: JobFormData) => {
        setIsGenerating(true);
        try {
            toast({ title: "Generating Question Bank...", description: "AI is crafting technical questions." });
            const result = await generateInterviewBank(data);
            setGeneratedQuestions(result.questions);
            toast({ title: "Generation Successful", description: `${result.questions.length} questions created.` });
        } catch (error) {
            toast({ title: "Generation Failed", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const onSave = async (data: JobFormData) => {
        if (!firestore || !user || generatedQuestions.length === 0) return;
        try {
            const bankRef = doc(collection(firestore, 'questionBanks'));
            const jobRef = doc(collection(firestore, 'jobs'));

            await setDoc(bankRef, {
                jobPositionId: jobRef.id,
                questions: generatedQuestions,
                createdBy: user.id,
                createdAt: Date.now(),
            });

            await setDoc(jobRef, {
                ...data,
                questionBankId: bankRef.id,
                createdBy: user.id,
                createdAt: Date.now(),
            });

            toast({ title: "Job Position Created" });
            router.push('/admin/pipeline');
        } catch (error) {
            toast({ title: "Save Failed", variant: "destructive" });
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <h1 className="text-4xl font-bold mb-8">Setup AI Voice Interview</h1>

            <div className="grid gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Job & Question Configuration</CardTitle>
                        <CardDescription>Define parameters for the AI interview bank.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Job Role</Label>
                                <Input {...register('role')} placeholder="e.g. Senior Backend Engineer" />
                            </div>
                            <div className="space-y-2">
                                <Label>Domain</Label>
                                <Input {...register('domain')} placeholder="e.g. Fintech, Healthcare" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Topics</Label>
                            <Controller
                                name="topics"
                                control={control}
                                render={({ field }) => (
                                    <ReactSelect
                                        isMulti
                                        options={skillsOptions}
                                        onChange={(val: any) => field.onChange(val.map((v: any) => v.label))}
                                        className="text-black"
                                    />
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Difficulty</Label>
                                <Controller
                                    name="difficulty"
                                    control={control}
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="easy">Easy</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="hard">Hard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Questions to Bank</Label>
                                <Input type="number" {...register('n', { valueAsNumber: true })} />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSubmit(onGenerate)} disabled={isGenerating} className="w-full">
                            {isGenerating ? <Loader2 className="animate-spin mr-2" /> : <Wand2 className="mr-2" />}
                            Generate Question Bank
                        </Button>
                    </CardFooter>
                </Card>

                {generatedQuestions.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Review Bank ({generatedQuestions.length} Questions)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                            {generatedQuestions.map((q, i) => (
                                <div key={i} className="p-3 border rounded-lg bg-muted/30">
                                    <div className="flex justify-between items-start mb-1">
                                        <Badge variant="outline">{q.topic}</Badge>
                                        <Badge variant="secondary">{q.difficulty}</Badge>
                                    </div>
                                    <p className="text-sm">{q.question}</p>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter>
                            <Button onClick={handleSubmit(onSave)} className="w-full">
                                <Save className="mr-2" /> Finalize & Save Job Position
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </div>
        </div>
    );
}
