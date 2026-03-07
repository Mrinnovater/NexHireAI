
'use server';
/**
 * @fileOverview A flow to generate a bank of interview questions for a job position.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const InterviewQuestionSchema = z.object({
    id: z.number(),
    question: z.string().describe("Short and clear question for verbal answering."),
    topic: z.string(),
    difficulty: z.string()
});

const GenerateBankInputSchema = z.object({
    role: z.string(),
    domain: z.string(),
    topics: z.array(z.string()),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    n: z.number().min(5).max(50),
});

const GenerateBankOutputSchema = z.object({
    role: z.string(),
    domain: z.string(),
    questions: z.array(InterviewQuestionSchema),
});

export const generateInterviewBankFlow = ai.defineFlow(
    {
        name: 'generateInterviewBankFlow',
        inputSchema: GenerateBankInputSchema,
        outputSchema: GenerateBankOutputSchema,
    },
    async (input) => {
        const { role, domain, topics, difficulty, n } = input;

        const { output } = await ai.generate({
            prompt: `You are an expert technical interviewer.
            Your task is to generate interview questions for an AI interview platform called NexHireAI.

            Inputs provided:
            - Job Role: ${role}
            - Domain: ${domain}
            - Topics: ${topics.join(', ')}
            - Difficulty Level: ${difficulty}
            - Number of Questions to Generate: ${n}

            Instructions:
            1. Generate high-quality technical interview questions relevant to the given domain and topics.
            2. Questions should test real understanding, not simple definitions.
            3. Each question should be short and clear so the candidate can answer verbally.
            4. Avoid extremely long or theoretical questions.
            5. Return exactly ${n} questions.
            6. Return the output strictly in JSON format.

            Do not include explanations.`,
            output: { schema: GenerateBankOutputSchema },
            config: { temperature: 0.7 }
        });

        if (!output) throw new Error("Failed to generate interview questions.");
        return output;
    }
);

export async function generateInterviewBank(input: z.infer<typeof GenerateBankInputSchema>) {
    return generateInterviewBankFlow(input);
}
