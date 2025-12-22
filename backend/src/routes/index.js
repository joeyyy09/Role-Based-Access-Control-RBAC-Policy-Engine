
import express from 'express';
import { PolicyController } from '../controllers/policyController.js';
import { validate } from '../middleware/validator.js';
import { chatSchema, evaluateSchema } from '../middleware/schemas.js';

const router = express.Router();

router.get('/check-connection', PolicyController.checkConnection);
router.get('/state', PolicyController.getState);
router.post('/reset', PolicyController.resetState);
router.post('/chat', validate(chatSchema), PolicyController.processChat);
router.get('/validate', PolicyController.validatePolicy);
router.post('/evaluate', validate(evaluateSchema), PolicyController.evaluateAccess);

export default router;
