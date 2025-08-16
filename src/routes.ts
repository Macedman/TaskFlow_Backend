import express, { Request, Response } from 'express';
import { signup } from './middlewares/signup';
import { login } from './middlewares/login';
import { authMiddleware } from './middlewares/authMiddleware';
import { getTasks } from './getTasks/getTasks';

const router = express.Router();
//router.use(authMiddleware)

//unprotected routes
router.post('/api/signup', signup);
router.post('/api/login', login);

//protected routes
router.use(authMiddleware);
router.post('/api/getTasks', getTasks);


export default router;
