
'use server';
/**
 * @fileOverview A flow to evaluate an entire voice interview session in one call.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const EvaluateInterviewInputSchema = z.object({
    role: z.string(),
    questions_and_answers: z.array(z.object({
        question: z.string(),
        answer: z.string(),
    })),
});

const EvaluateInterviewOutputSchema = z.object({
    evaluation: z.array(z.object({
        question: z.string(),
        technical_score: z.number().min(0).max(10),
        communication_score: z.number().min(0).max(10),
        confidence_score: z.number().min(0).max(10),
        remarks: z.string(),
    })),
    overall_scores: z.object({
        technical_knowledge: z.number(),
        communication: z.number(),
        confidence: z.number(),
    }),
    final_recommendation: z.enum(['Strong Hire', 'Hire', 'Borderline', 'Reject']),
    summary: z.string(),
});

export const evaluateVoiceInterviewFlow = ai.defineFlow(
    {
        name: 'evaluateVoiceInterviewFlow',
        inputSchema: EvaluateInterviewInputSchema,
        outputSchema: EvaluateInterviewOutputSchema,
    },
    async (input) => {
        const { output } = await ai.generate({
            prompt: `You are an AI technical interviewer evaluating a candidate in an automated interview system called NexHireAI.

            You will receive:
            - Job Role: ${input.role}
            - A list of interview questions and the candidate's spoken answers (converted to text).

            Questions & Answers:
            ${JSON.stringify(input.questions_and_answers, null, 2)}

            Evaluate the candidate fairly based on:
            1. Technical knowledge
            2. Communication clarity
            3. Confidence and explanation ability
            4. Relevance of the answer to the question

            Scoring Rules:
            - Each answer should be scored from 0 to 10.
            - Provide short reasoning for each score.
            - At the end calculate overall scores.
            - Be objective and strict.
            - If the candidate answer is incorrect or irrelevant, reduce technical score.
            - If the explanation is unclear, reduce communication score.

            Return strictly in JSON format.`,
            output: { schema: EvaluateInterviewOutputSchema },
            config: { temperature: 0.2 }
        });

        if (!output) throw new Error("Evaluation failed.");
        return output;
    }
);

export async function evaluateVoiceInterview(input: z.infer<typeof EvaluateInterviewInputSchema>) {
    return evaluateVoiceInterviewFlow(input);
}
