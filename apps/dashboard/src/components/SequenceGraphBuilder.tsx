"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  api,
  type StepType,
  type EdgeCondition,
  type SequenceStep,
  type SequenceEdge,
} from "@/lib/api";

type StepNodeData = {
  type: StepType;
  config: Record<string, unknown>;
  isEntry: boolean;
};

type StepFlowNode = Node<StepNodeData, "step">;

const STEP_META: Record<StepType, { label: string; accent: string }> = {
  SCRAPE_SEARCH: { label: "Scrape Search", accent: "border-violet-500/50 bg-violet-500/10 text-violet-200" },
  VISIT_PROFILE: { label: "Visit Profile", accent: "border-blue-500/50 bg-blue-500/10 text-blue-200" },
  LIKE_POST: { label: "Like Post", accent: "border-pink-500/50 bg-pink-500/10 text-pink-200" },
  WAIT: { label: "Wait", accent: "border-slate-500/50 bg-slate-500/10 text-slate-200" },
  SEND_CONNECTION_REQUEST: { label: "Send Connection Request", accent: "border-teal-500/50 bg-teal-500/10 text-teal-200" },
  SEND_MESSAGE: { label: "Send Message", accent: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" },
  SEND_INMAIL: { label: "Send InMail", accent: "border-amber-500/50 bg-amber-500/10 text-amber-200" },
  WITHDRAW_CONNECTION: { label: "Withdraw Connection", accent: "border-red-500/50 bg-red-500/10 text-red-200" },
};

export const STEP_TYPE_LABELS: Record<StepType, string> = Object.fromEntries(
  Object.entries(STEP_META).map(([type, meta]) => [type, meta.label])
) as Record<StepType, string>;

const PALETTE: StepType[] = [
  "SCRAPE_SEARCH",
  "VISIT_PROFILE",
  "LIKE_POST",
  "WAIT",
  "SEND_CONNECTION_REQUEST",
  "SEND_MESSAGE",
  "SEND_INMAIL",
  "WITHDRAW_CONNECTION",
];

const TEMPLATE_HINT =
  "{{firstName}} {{lastName}} {{company}} {{title}} {{postExcerpt}} {{postTopic}} {{postDate}}";

function newId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultConfigFor(type: StepType): Record<string, unknown> {
  switch (type) {
    case "WAIT":
      return { waitDays: 1 };
    case "SEND_CONNECTION_REQUEST":
      return { bodyTemplate: "", timeoutDays: 3 };
    case "SEND_MESSAGE":
      return { bodyTemplate: "" };
    case "SEND_INMAIL":
      return { subjectTemplate: "Hi {{firstName}}", bodyTemplate: "" };
    case "LIKE_POST":
      return { postUrlSource: "referenced" };
    default:
      return {};
  }
}

function StepNodeComponent({ data, selected }: NodeProps<StepFlowNode>) {
  const meta = STEP_META[data.type];
  const isBranch = data.type === "SEND_CONNECTION_REQUEST";

  return (
    <div
      className={`min-w-[190px] rounded-2xl border-2 bg-slate-900 px-3 py-2.5 shadow-lg transition ${meta.accent} ${
        selected ? "ring-2 ring-white/50" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-white/30 !bg-slate-400"
      />

      <div className="flex items-center gap-1.5">
        {data.isEntry && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Entry
          </span>
        )}
        <span className="text-xs font-semibold">{meta.label}</span>
      </div>

      {isBranch ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-emerald-300">
            Accepted
            <Handle
              type="source"
              position={Position.Right}
              id="accepted"
              style={{ position: "relative", top: 0, right: -8, transform: "none" }}
              className="!h-2.5 !w-2.5 !border-white/30 !bg-emerald-400"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-amber-300">
            Timed out
            <Handle
              type="source"
              position={Position.Right}
              id="timeout"
              style={{ position: "relative", top: 0, right: -8, transform: "none" }}
              className="!h-2.5 !w-2.5 !border-white/30 !bg-amber-400"
            />
          </div>
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="!h-2.5 !w-2.5 !border-white/30 !bg-slate-400"
        />
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNodeComponent };

function conditionForHandle(handle: string | null | undefined): EdgeCondition {
  if (handle === "accepted") return "CONNECTION_ACCEPTED";
  if (handle === "timeout") return "CONNECTION_TIMEOUT";
  return "DEFAULT";
}

function stepsToNodes(steps: SequenceStep[]): StepFlowNode[] {
  return steps.map((s) => ({
    id: s.id,
    type: "step",
    position: { x: s.positionX, y: s.positionY },
    data: { type: s.type, config: s.config ?? {}, isEntry: s.isEntry },
  }));
}

function edgesToFlow(edges: SequenceEdge[]): Edge[] {
  return edges.map((e) => ({
    id: `${e.fromStepId}-${e.toStepId}-${e.condition}`,
    source: e.fromStepId,
    target: e.toStepId,
    sourceHandle:
      e.condition === "CONNECTION_ACCEPTED"
        ? "accepted"
        : e.condition === "CONNECTION_TIMEOUT"
        ? "timeout"
        : "default",
    label: e.condition === "DEFAULT" ? undefined : e.condition === "CONNECTION_ACCEPTED" ? "Accepted" : "Timed out",
    style: { stroke: "#64748b" },
    labelStyle: { fill: "#cbd5e1", fontSize: 10, fontWeight: 600 },
  }));
}

// Config panel — fields conditional on step type

function ConfigPanel({
  node,
  onChangeConfig,
  onMakeEntry,
  onDelete,
}: {
  node: StepFlowNode;
  onChangeConfig: (config: Record<string, unknown>) => void;
  onMakeEntry: () => void;
  onDelete: () => void;
}) {
  const config = node.data.config;
  const meta = STEP_META[node.data.type];

  function set(key: string, value: unknown) {
    onChangeConfig({ ...config, [key]: value });
  }

  return (
    <div
      data-testid="config-panel"
      className="w-80 shrink-0 space-y-4 rounded-2xl border border-white/[0.08] bg-slate-900 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step config</p>
          <h3 className="mt-0.5 text-sm font-semibold text-white">{meta.label}</h3>
        </div>
        {node.data.isEntry ? (
          <span className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[11px] font-semibold text-teal-300">
            Entry step
          </span>
        ) : (
          <button
            type="button"
            onClick={onMakeEntry}
            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-teal-500/40 hover:text-teal-300"
          >
            Make entry
          </button>
        )}
      </div>

      {node.data.type === "WAIT" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Wait (days)</label>
          <input
            type="number"
            min={0}
            value={typeof config.waitDays === "number" ? config.waitDays : 0}
            onChange={(e) => set("waitDays", Number(e.target.value))}
            className="field w-full"
          />
        </div>
      )}

      {node.data.type === "SEND_CONNECTION_REQUEST" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">
              Connection note{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={typeof config.bodyTemplate === "string" ? config.bodyTemplate : ""}
              onChange={(e) => set("bodyTemplate", e.target.value)}
              className="field w-full font-mono text-xs"
              placeholder="Hi {{firstName}}, loved your post about {{postTopic}}..."
            />
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Use {TEMPLATE_HINT}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">
              Timeout before &quot;Timed out&quot; branch (days)
            </label>
            <input
              type="number"
              min={1}
              value={typeof config.timeoutDays === "number" ? config.timeoutDays : 3}
              onChange={(e) => set("timeoutDays", Number(e.target.value))}
              className="field w-full"
            />
          </div>
        </>
      )}

      {node.data.type === "SEND_MESSAGE" && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Message body</label>
          <textarea
            rows={5}
            value={typeof config.bodyTemplate === "string" ? config.bodyTemplate : ""}
            onChange={(e) => set("bodyTemplate", e.target.value)}
            className="field w-full font-mono text-xs"
            placeholder={"Hi {{firstName}},\n\n..."}
          />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Use {TEMPLATE_HINT}</p>
        </div>
      )}

      {node.data.type === "SEND_INMAIL" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Subject</label>
            <input
              value={typeof config.subjectTemplate === "string" ? config.subjectTemplate : ""}
              onChange={(e) => set("subjectTemplate", e.target.value)}
              className="field w-full font-mono text-xs"
              placeholder="Hi {{firstName}}"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Message body</label>
            <textarea
              rows={5}
              value={typeof config.bodyTemplate === "string" ? config.bodyTemplate : ""}
              onChange={(e) => set("bodyTemplate", e.target.value)}
              className="field w-full font-mono text-xs"
            />
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Use {TEMPLATE_HINT}</p>
          </div>
        </>
      )}

      {node.data.type === "LIKE_POST" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Post to like</label>
            <select
              value={typeof config.postUrlSource === "string" ? config.postUrlSource : "referenced"}
              onChange={(e) => set("postUrlSource", e.target.value)}
              className="field w-full"
            >
              <option value="referenced">Referenced post (from content signal)</option>
              <option value="static">Static URL</option>
            </select>
          </div>
          {config.postUrlSource === "static" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Post URL</label>
              <input
                value={typeof config.postUrl === "string" ? config.postUrl : ""}
                onChange={(e) => set("postUrl", e.target.value)}
                className="field w-full font-mono text-xs"
                placeholder="https://www.linkedin.com/feed/update/..."
              />
            </div>
          )}
        </>
      )}

      {(node.data.type === "SCRAPE_SEARCH" ||
        node.data.type === "VISIT_PROFILE" ||
        node.data.type === "WITHDRAW_CONNECTION") && (
        <p className="text-xs leading-5 text-slate-500">This step needs no configuration.</p>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20"
      >
        Delete step
      </button>
    </div>
  );
}

interface SequenceGraphBuilderProps {
  campaignId: string;
  campaignStatus: "ACTIVE" | "PAUSED" | "COMPLETED";
  initialSteps: SequenceStep[];
  initialEdges: SequenceEdge[];
}

function Builder({ campaignId, campaignStatus, initialSteps, initialEdges }: SequenceGraphBuilderProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<StepFlowNode>(stepsToNodes(initialSteps));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesToFlow(initialEdges));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${connection.sourceHandle ?? "default"}`,
            style: { stroke: "#64748b" },
            label:
              connection.sourceHandle === "accepted"
                ? "Accepted"
                : connection.sourceHandle === "timeout"
                ? "Timed out"
                : undefined,
            labelStyle: { fill: "#cbd5e1", fontSize: 10, fontWeight: 600 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/step-type") as StepType | "";
    if (!type) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = newId();
    const node: StepFlowNode = {
      id,
      type: "step",
      position,
      data: { type, config: defaultConfigFor(type), isEntry: nodes.length === 0 },
    };
    setNodes((prev) => [...prev, node]);
    setSelectedId(id);
  }

  function handleChangeConfig(config: Record<string, unknown>) {
    if (!selectedId) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, config } } : n))
    );
  }

  function handleMakeEntry() {
    if (!selectedId) return;
    setNodes((prev) =>
      prev.map((n) => ({ ...n, data: { ...n.data, isEntry: n.id === selectedId } }))
    );
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  function applyGraph(graph: { steps: SequenceStep[]; edges: SequenceEdge[] }) {
    setNodes(stepsToNodes(graph.steps));
    setEdges(edgesToFlow(graph.edges));
    setSelectedId(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const steps: SequenceStep[] = nodes.map((n) => ({
        id: n.id,
        campaignId,
        type: n.data.type,
        config: n.data.config,
        positionX: n.position.x,
        positionY: n.position.y,
        isEntry: n.data.isEntry,
      }));
      const edgePayload: SequenceEdge[] = edges.map((e) => ({
        fromStepId: e.source,
        toStepId: e.target,
        condition: conditionForHandle(e.sourceHandle),
      }));
      const saved = await api.sequences.graph.save(campaignId, { steps, edges: edgePayload });
      applyGraph(saved);
      toast.success("Graph saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const graph = await api.sequences.graph.get(campaignId);
      applyGraph(graph);
      toast.success("Reloaded from server");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReloading(false);
    }
  }

  const isActive = campaignStatus === "ACTIVE";

  return (
    <div className="space-y-3">
      {isActive && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-300">
          This campaign is ACTIVE. Pause it before restructuring the graph — saving is rejected if a
          step you remove still has a lead sitting on it.
        </div>
      )}

      <div className="flex gap-4">
        {/* Palette */}
        <div className="w-52 shrink-0 space-y-2 rounded-2xl border border-white/[0.08] bg-slate-900 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Drag to add
          </p>
          {PALETTE.map((type) => {
            const meta = STEP_META[type];
            return (
              <div
                key={type}
                draggable
                data-testid={`palette-${type}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/step-type", type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={`cursor-grab rounded-xl border-2 px-3 py-2 text-xs font-semibold active:cursor-grabbing ${meta.accent}`}
              >
                {meta.label}
              </div>
            );
          })}
        </div>

        {/* Canvas */}
        <div
          data-testid="sequence-canvas"
          className="h-[640px] flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            colorMode="dark"
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          >
            <Background gap={20} color="#1e293b" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(2, 6, 23, 0.7)"
              style={{ backgroundColor: "#0f172a" }}
            />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            onChangeConfig={handleChangeConfig}
            onMakeEntry={handleMakeEntry}
            onDelete={handleDeleteSelected}
          />
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="save-graph"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving..." : "Save Graph"}
        </button>
        <button
          type="button"
          data-testid="reload-graph"
          onClick={handleReload}
          disabled={reloading}
          className="btn-secondary"
        >
          {reloading ? "Reloading..." : "Reload from server"}
        </button>
      </div>
    </div>
  );
}

export function SequenceGraphBuilder(props: SequenceGraphBuilderProps) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}
