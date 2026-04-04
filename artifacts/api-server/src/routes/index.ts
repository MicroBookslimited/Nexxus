import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import variantsRouter from "./variants";
import ordersRouter from "./orders";
import heldOrdersRouter from "./held-orders";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import reportsRouter from "./reports";
import tablesRouter from "./tables";
import kitchenRouter from "./kitchen";
import staffRouter from "./staff";
import purchasesRouter from "./purchases";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(variantsRouter);
router.use(ordersRouter);
router.use(heldOrdersRouter);
router.use(dashboardRouter);
router.use(customersRouter);
router.use(reportsRouter);
router.use(tablesRouter);
router.use(kitchenRouter);
router.use(staffRouter);
router.use(purchasesRouter);

export default router;
