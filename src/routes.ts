import express, { Request, Response, RequestHandler } from 'express';
import { signup } from './middlewares/signup';
import { login } from './middlewares/login';
import { authMiddleware } from './middlewares/authMiddleware';
import { getTasks } from './getTasks/getTasks';
import { getTaskDetails } from './getTaskDetails/getTaskDetails';
import { addTask } from './addTask/addTask';
import { addList } from './addList/addList';
import { updateList } from './updateList/updateList';
import { getBoards } from './getBoards/getBoards';
import { createBoard } from './createBoards/createBoards';

const router = express.Router();
//router.use(authMiddleware)

//unprotected routes
router.post('/api/signup', signup as RequestHandler);
router.post('/api/login', login);

//protected routes
// authMiddleware has a custom request type (AuthRequest). Cast to RequestHandler
// so Express' overloads accept it here.
router.use(authMiddleware as RequestHandler);
router.post('/api/getTasks', getTasks);
router.post('/api/getTaskDetails', getTaskDetails);
router.post('/api/addTask', addTask);
router.post('/api/addList', addList);
router.post('/api/updateList', updateList);
router.post('/api/getBoards', getBoards);
router.post('/api/createBoards', createBoard);
export default router;
