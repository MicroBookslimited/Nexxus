import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import ordersRouter from "./orders";
import heldOrdersRouter from "./held-orders";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(heldOrdersRouter);
router.use(dashboardRouter);
router.use(customersRouter);
router.use(reportsRouter);

export default router;
