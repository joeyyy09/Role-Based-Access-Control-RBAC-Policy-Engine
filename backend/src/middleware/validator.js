
import { z } from 'zod';

export const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ 
                error: 'Validation Error', 
                details: e.errors.map(err => ({ field: err.path.join('.'), message: err.message }))
            });
        }
        res.status(500).json({ error: 'Internal Validation Error' });
    }
};
