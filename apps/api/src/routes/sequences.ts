import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, StepType, EdgeCondition, CampaignStatus } from "@linkedin-automation/db";

export const sequencesRouter: IRouter = Router();

const StepInput = z.object({
  id: z.string().min(1),
  type: z.nativeEnum(StepType),
  config: z.record(z.any()).default({}),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  isEntry: z.boolean().default(false),
});

const EdgeInput = z.object({
  fromStepId: z.string().min(1),
  toStepId: z.string().min(1),
  condition: z.nativeEnum(EdgeCondition).default(EdgeCondition.DEFAULT),
});

const GraphInput = z.object({
  steps: z.array(StepInput).min(1),
  edges: z.array(EdgeInput),
});

/** Throws a validation error with an HTTP status attached. */
export class GraphValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function assertNoCycles(
  steps: z.infer<typeof StepInput>[],
  edges: z.infer<typeof EdgeInput>[]
): void {
  const adjacency = new Map<string, string[]>();
  for (const step of steps) adjacency.set(step.id, []);
  for (const edge of edges) adjacency.get(edge.fromStepId)?.push(edge.toStepId);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(steps.map((s) => [s.id, WHITE]));

  function visit(stepId: string): void {
    color.set(stepId, GRAY);
    for (const next of adjacency.get(stepId) ?? []) {
      const nextColor = color.get(next);
      if (nextColor === GRAY) {
        throw new GraphValidationError(422, "Graph contains a cycle — SEQUENCE graphs must be a DAG");
      }
      if (nextColor === WHITE) visit(next);
    }
    color.set(stepId, BLACK);
  }

  for (const step of steps) {
    if (color.get(step.id) === WHITE) visit(step.id);
  }
}

export function validateGraphShape(
  steps: z.infer<typeof StepInput>[],
  edges: z.infer<typeof EdgeInput>[]
): void {
  const entrySteps = steps.filter((s) => s.isEntry);
  if (entrySteps.length !== 1) {
    throw new GraphValidationError(422, `Graph must have exactly one entry step (found ${entrySteps.length})`);
  }

  const stepIds = new Set(steps.map((s) => s.id));
  for (const edge of edges) {
    if (!stepIds.has(edge.fromStepId) || !stepIds.has(edge.toStepId)) {
      throw new GraphValidationError(
        422,
        `Edge references a step not present in this payload (${edge.fromStepId} -> ${edge.toStepId})`
      );
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.fromStepId}::${edge.condition}`;
    if (edgeKeys.has(key)) {
      throw new GraphValidationError(
        422,
        `Step ${edge.fromStepId} has more than one outgoing edge with condition ${edge.condition}`
      );
    }
    edgeKeys.add(key);
  }

  assertNoCycles(steps, edges);
}

// GET /campaigns/:id/graph
sequencesRouter.get("/:id/graph", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });

    const [steps, edges] = await Promise.all([
      prisma.sequenceStep.findMany({ where: { campaignId: campaign.id } }),
      prisma.sequenceEdge.findMany({ where: { campaignId: campaign.id } }),
    ]);

    res.json({ steps, edges });
  } catch (err) {
    next(err);
  }
});

// PUT /campaigns/:id/graph — replace the whole graph atomically.
sequencesRouter.put("/:id/graph", async (req, res, next) => {
  try {
    const { steps, edges } = GraphInput.parse(req.body);
    validateGraphShape(steps, edges);

    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true, status: true },
    });

    const payloadIds = steps.map((s) => s.id);

    // Any step id that already exists in the DB must belong to this campaign
    // (closes off cross-campaign id collisions) — anything not found is a
    // brand-new step, created with the client-supplied id.
    const existingSteps = await prisma.sequenceStep.findMany({
      where: { id: { in: payloadIds } },
      select: { id: true, campaignId: true },
    });
    for (const existing of existingSteps) {
      if (existing.campaignId !== campaign.id) {
        res.status(400).json({ error: `Step id ${existing.id} belongs to another campaign` });
        return;
      }
    }
    const existingIds = new Set(existingSteps.map((s) => s.id));

    // Steps present in the DB but omitted from this payload are deletions.
    // Reject deleting a step still referenced by an in-flight lead while the
    // campaign is ACTIVE — its currentStepId FK would dangle mid-run.
    const currentDbSteps = await prisma.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      select: { id: true },
    });
    const removedIds = currentDbSteps
      .map((s) => s.id)
      .filter((id) => !payloadIds.includes(id));

    if (removedIds.length > 0 && campaign.status === CampaignStatus.ACTIVE) {
      const inFlight = await prisma.campaignLead.count({
        where: { campaignId: campaign.id, currentStepId: { in: removedIds } },
      });
      if (inFlight > 0) {
        res.status(409).json({
          error:
            "Cannot remove a step that's still referenced by an in-flight lead while the campaign is ACTIVE — pause the campaign first",
        });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const step of steps) {
        if (existingIds.has(step.id)) {
          await tx.sequenceStep.update({
            where: { id: step.id },
            data: {
              type: step.type,
              config: step.config,
              positionX: step.positionX,
              positionY: step.positionY,
              isEntry: step.isEntry,
            },
          });
        } else {
          await tx.sequenceStep.create({
            data: {
              id: step.id,
              campaignId: campaign.id,
              type: step.type,
              config: step.config,
              positionX: step.positionX,
              positionY: step.positionY,
              isEntry: step.isEntry,
            },
          });
        }
      }

      if (removedIds.length > 0) {
        await tx.sequenceStep.deleteMany({ where: { id: { in: removedIds } } });
      }

      // Edges have no external FKs pointing at them — safe to blanket-replace.
      await tx.sequenceEdge.deleteMany({ where: { campaignId: campaign.id } });
      if (edges.length > 0) {
        await tx.sequenceEdge.createMany({
          data: edges.map((edge) => ({
            campaignId: campaign.id,
            fromStepId: edge.fromStepId,
            toStepId: edge.toStepId,
            condition: edge.condition,
          })),
        });
      }
    });

    const [savedSteps, savedEdges] = await Promise.all([
      prisma.sequenceStep.findMany({ where: { campaignId: campaign.id } }),
      prisma.sequenceEdge.findMany({ where: { campaignId: campaign.id } }),
    ]);

    res.json({ steps: savedSteps, edges: savedEdges });
  } catch (err) {
    if (err instanceof GraphValidationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});
