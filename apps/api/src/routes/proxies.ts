import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, ProxyHealth, ProxyRotationMode } from "@linkedin-automation/db";
import {
  checkProxyHealth,
  createProxySessionId,
  detectProxyIp,
} from "@linkedin-automation/browser";

export const proxiesRouter: IRouter = Router();

proxiesRouter.get("/", async (_req, res, next) => {
  try {
    const proxies = await prisma.proxy.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(proxies);
  } catch (err) {
    next(err);
  }
});

proxiesRouter.post("/", async (req, res, next) => {
  try {
    const schema = z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      country: z.string().min(1),
      city: z.string().optional(),
      username: z.string().min(1),
      usernameTemplate: z.string().optional(),
      password: z.string().min(1),
      rotationMode: z.nativeEnum(ProxyRotationMode).default(ProxyRotationMode.STATIC),
    });
    const data = schema.parse(req.body);
    if (
      data.rotationMode === ProxyRotationMode.STICKY_SESSION &&
      data.usernameTemplate &&
      !data.usernameTemplate.includes("{{sessionId}}")
    ) {
      res.status(400).json({
        error: "Sticky session username template must include {{sessionId}}.",
      });
      return;
    }
    const proxy = await prisma.proxy.create({ data });
    res.status(201).json(proxy);
  } catch (err) {
    next(err);
  }
});

proxiesRouter.patch("/:id", async (req, res, next) => {
  try {
    const schema = z.object({
      healthStatus: z.nativeEnum(ProxyHealth).optional(),
      host: z.string().min(1).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      country: z.string().min(1).optional(),
      city: z.string().nullable().optional(),
      username: z.string().min(1).optional(),
      usernameTemplate: z.string().nullable().optional(),
      password: z.string().min(1).optional(),
      rotationMode: z.nativeEnum(ProxyRotationMode).optional(),
    });
    const data = schema.parse(req.body);
    if (
      data.rotationMode === ProxyRotationMode.STICKY_SESSION &&
      data.usernameTemplate &&
      !data.usernameTemplate.includes("{{sessionId}}")
    ) {
      res.status(400).json({
        error: "Sticky session username template must include {{sessionId}}.",
      });
      return;
    }
    const proxy = await prisma.proxy.update({
      where: { id: req.params.id },
      data,
    });
    res.json(proxy);
  } catch (err) {
    next(err);
  }
});

// POST /proxies/:id/check - verifies provider gateway and exit IP.
proxiesRouter.post("/:id/check", async (req, res, next) => {
  try {
    const proxy = await prisma.proxy.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    const sessionId =
      proxy.rotationMode === ProxyRotationMode.STICKY_SESSION
        ? createProxySessionId()
        : undefined;
    const reachable = await checkProxyHealth(proxy, sessionId);
    const exitIp = reachable ? await detectProxyIp(proxy, sessionId) : null;

    const healthStatus = reachable ? ProxyHealth.HEALTHY : ProxyHealth.DEAD;
    const updated = await prisma.proxy.update({
      where: { id: req.params.id },
      data: {
        healthStatus,
        currentSessionId: sessionId ?? null,
        currentExitIp: exitIp,
        lastSessionStartedAt: sessionId ? new Date() : proxy.lastSessionStartedAt,
        lastUsed: new Date(),
      },
    });
    res.json({ reachable, healthStatus, exitIp, sessionId, proxy: updated });
  } catch (err) {
    next(err);
  }
});

proxiesRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.proxy.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
