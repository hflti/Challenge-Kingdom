import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kingdomStateRouter from "./kingdom-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kingdomStateRouter);

export default router;
