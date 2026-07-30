import { Router, type IRouter } from "express";
import { prisma } from "@linkedin-automation/db";

export const aiAssetsRouter: IRouter = Router();

aiAssetsRouter.get("/:id/:filename", async (req, res, next) => {
  try {
    const asset = await prisma.aiGeneratedAsset.findUnique({
      where: { id: req.params.id },
      select: {
        filename: true,
        mimeType: true,
        bytes: true,
        createdAt: true,
      },
    });

    if (!asset || asset.filename !== req.params.filename) {
      res.status(404).send("Not found");
      return;
    }

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Length", asset.bytes.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Last-Modified", asset.createdAt.toUTCString());
    res.send(Buffer.from(asset.bytes));
  } catch (err) {
    next(err);
  }
});
