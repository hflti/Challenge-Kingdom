import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kingdomStateRouter from "./kingdom-state";
import accountsRouter from "./accounts";
import profileImagesRouter from "./profile-images";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kingdomStateRouter);
router.use(accountsRouter);
router.use(profileImagesRouter);

export default router;
