
import express from 'express';
import { PolicyController } from '../controllers/policyController.js';

const router = express.Router();

router.get('/check-connection', PolicyController.checkConnection);
router.get('/state', PolicyController.getState);
router.post('/reset', PolicyController.resetState);
router.post('/chat', PolicyController.processChat);
router.get('/validate', PolicyController.validatePolicy);
router.post('/evaluate', PolicyController.evaluateAccess);

export default router;
