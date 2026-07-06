import { describe, expect, it } from "vitest";
import { StepType, EdgeCondition } from "@linkedin-automation/db";
import { validateGraphShape, GraphValidationError } from "./sequences.js";

function step(id: string, type: StepType, isEntry = false) {
  return { id, type, config: {}, positionX: 0, positionY: 0, isEntry };
}

function edge(fromStepId: string, toStepId: string, condition: EdgeCondition = EdgeCondition.DEFAULT) {
  return { fromStepId, toStepId, condition };
}

describe("validateGraphShape", () => {
  it("accepts a valid linear graph with a branch", () => {
    const steps = [
      step("a", StepType.WAIT, true),
      step("b", StepType.SEND_CONNECTION_REQUEST),
      step("c", StepType.SEND_MESSAGE),
      step("d", StepType.WITHDRAW_CONNECTION),
    ];
    const edges = [
      edge("a", "b"),
      edge("b", "c", EdgeCondition.CONNECTION_ACCEPTED),
      edge("b", "d", EdgeCondition.CONNECTION_TIMEOUT),
    ];
    expect(() => validateGraphShape(steps, edges)).not.toThrow();
  });

  it("rejects a graph with no entry step", () => {
    const steps = [step("a", StepType.WAIT)];
    expect(() => validateGraphShape(steps, [])).toThrow(GraphValidationError);
  });

  it("rejects a graph with more than one entry step", () => {
    const steps = [step("a", StepType.WAIT, true), step("b", StepType.LIKE_POST, true)];
    expect(() => validateGraphShape(steps, [])).toThrow(GraphValidationError);
  });

  it("rejects an edge referencing a step outside the payload", () => {
    const steps = [step("a", StepType.WAIT, true)];
    const edges = [edge("a", "ghost")];
    expect(() => validateGraphShape(steps, edges)).toThrow(GraphValidationError);
  });

  it("rejects two edges from the same step with the same condition", () => {
    const steps = [
      step("a", StepType.WAIT, true),
      step("b", StepType.SEND_MESSAGE),
      step("c", StepType.SEND_MESSAGE),
    ];
    const edges = [edge("a", "b"), edge("a", "c")];
    expect(() => validateGraphShape(steps, edges)).toThrow(GraphValidationError);
  });

  it("rejects a cycle", () => {
    const steps = [
      step("a", StepType.WAIT, true),
      step("b", StepType.WAIT),
      step("c", StepType.WAIT),
    ];
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a")];
    expect(() => validateGraphShape(steps, edges)).toThrow(GraphValidationError);
  });

  it("allows the same step to be the target of both an ACCEPTED and TIMEOUT edge from different sources", () => {
    const steps = [
      step("a", StepType.WAIT, true),
      step("b", StepType.SEND_CONNECTION_REQUEST),
      step("c", StepType.SEND_CONNECTION_REQUEST),
      step("end", StepType.WITHDRAW_CONNECTION),
    ];
    const edges = [
      edge("a", "b"),
      edge("b", "c", EdgeCondition.CONNECTION_ACCEPTED),
      edge("b", "end", EdgeCondition.CONNECTION_TIMEOUT),
      edge("c", "end", EdgeCondition.CONNECTION_TIMEOUT),
    ];
    expect(() => validateGraphShape(steps, edges)).not.toThrow();
  });
});
