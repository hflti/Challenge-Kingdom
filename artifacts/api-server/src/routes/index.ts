import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kingdomStateRouter from "./kingdom-state";
import accountsRouter from "./accounts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kingdomStateRouter);
router.use(accountsRouter);

export default router;
