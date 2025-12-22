
import { z } from 'zod';

export const chatSchema = z.object({
    message: z.string().min(1, "Message cannot be empty")
});

export const evaluateSchema = z.object({
    policy: z.object({
        rules: z.array(z.any()).optional()
    }).optional(),
    query: z.object({
        role: z.string().min(1),
        action: z.string().min(1),
        resource: z.string().min(1),
        environment: z.string().optional()
    })
});
