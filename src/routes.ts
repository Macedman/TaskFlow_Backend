import express, { Request, Response, RequestHandler } from 'express';
import { signup } from './middlewares/signup';
import { login } from './middlewares/login';
import { loginLimiter, signupLimiter } from './middlewares/rateLimits';
import { authMiddleware } from './middlewares/authMiddleware';
import { getTasks } from './getTasks/getTasks';
import { getTaskDetails } from './getTaskDetails/getTaskDetails';
import { addTask } from './addTask/addTask';
import { addList } from './addList/addList';
import { updateList } from './updateList/updateList';
import { updateCard } from './updateCard/updateCard';
import { addComment } from './addComment/addComment';
import { getComments } from './getComments/getComments';
import { updateComment } from './updateComment/updateComment';
import { deleteComment } from './deleteComment/deleteComment';
import { addLinkAttachment } from './addLinkAttachment/addLinkAttachment';
import { getAttachments } from './getAttachments/getAttachments';
import { deleteAttachment } from './deleteAttachment/deleteAttachment';
import { uploadPdfAttachment } from './uploadPdfAttachment/uploadPdfAttachment';
import { getAttachmentDownloadUrl } from './getAttachmentDownloadUrl/getAttachmentDownloadUrl';
import { downloadFile } from './downloadFile/downloadFile';
import { getBoards } from './getBoards/getBoards';
import { createBoard } from './createBoards/createBoards';

const router = express.Router();
//router.use(authMiddleware)

//unprotected routes
router.post('/api/signup', signupLimiter, signup as RequestHandler);
router.post('/api/login', loginLimiter, login);

// the signed, short-lived token in the URL is the permission, so no login header
router.get('/api/files/:token', downloadFile);

//protected routes
// authMiddleware has a custom request type (AuthRequest). Cast to RequestHandler
// so Express' overloads accept it here.
router.use(authMiddleware as RequestHandler);
router.post('/api/getTasks', getTasks);
router.post('/api/getTaskDetails', getTaskDetails);
router.post('/api/addTask', addTask);
router.post('/api/addList', addList);
router.post('/api/updateList', updateList);
router.post('/api/updateCard', updateCard);
router.post('/api/addComment', addComment);
router.post('/api/getComments', getComments);
router.post('/api/updateComment', updateComment);
router.post('/api/deleteComment', deleteComment);
router.post('/api/addLinkAttachment', addLinkAttachment);
router.post('/api/getAttachments', getAttachments);
router.post('/api/deleteAttachment', deleteAttachment);
router.post('/api/uploadPdfAttachment', uploadPdfAttachment);
router.post('/api/getAttachmentDownloadUrl', getAttachmentDownloadUrl);
router.post('/api/getBoards', getBoards);
router.post('/api/createBoards', createBoard);
export default router;
