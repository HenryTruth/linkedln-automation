"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Message } from "@/lib/api";
import { api } from "@/lib/api";

// Drag handle icon

function DragHandle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="cursor-grab rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing touch-none"
      title="Drag to reorder"
    >
      <svg
        width="14"
        height="20"
        viewBox="0 0 14 20"
        fill="currentColor"
        aria-hidden
      >
        <circle cx="4" cy="4" r="2" />
        <circle cx="10" cy="4" r="2" />
        <circle cx="4" cy="10" r="2" />
        <circle cx="10" cy="10" r="2" />
        <circle cx="4" cy="16" r="2" />
        <circle cx="10" cy="16" r="2" />
      </svg>
    </button>
  );
}

// Inline edit form

function EditForm({
  message,
  campaignId,
  showSubject,
  onSave,
  onCancel,
}: {
  message: Message;
  campaignId: string;
  showSubject: boolean;
  onSave: (updated: Message) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(message.subjectTemplate ?? "");
  const [body, setBody] = useState(message.bodyTemplate);
  const [variant, setVariant] = useState(message.variantGroup);
  const [delay, setDelay] = useState(message.delayDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.campaigns.messages.update(
        campaignId,
        message.id,
        {
          subjectTemplate: showSubject ? subject || null : null,
          bodyTemplate: body,
          variantGroup: variant,
          delayDays: delay,
        }
      );
      onSave(updated);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Variant
          </label>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            className="field w-16"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Delay (days)
          </label>
          <input
            type="number"
            min={0}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="field w-20"
          />
        </div>
      </div>
      <div>
        {showSubject && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              InMail subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="field w-full font-mono"
              placeholder="Hi {{firstName}}"
            />
          </div>
        )}
        <label className="mb-1 block text-xs font-semibold text-slate-500">
          Message body{" "}
          <span className="text-slate-400">
            - use{" "}
            <code className="rounded bg-slate-200 px-1 text-xs">
              {"{{firstName}} {{lastName}} {{company}} {{title}} {{postExcerpt}} {{postTopic}} {{postDate}}"}
            </code>
          </span>
        </label>
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field w-full font-mono"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-4 py-1.5"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Sortable message card

function SortableCard({
  message,
  index,
  campaignId,
  showSubject,
  onUpdate,
  onDelete,
}: {
  message: Message;
  index: number;
  campaignId: string;
  showSubject: boolean;
  onUpdate: (updated: Message) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: message.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  async function handleDelete() {
    if (
      !confirm(
        `Delete step ${index + 1} (variant ${message.variantGroup})? This can't be undone.`
      )
    )
      return;
    try {
      await api.campaigns.messages.delete(campaignId, message.id);
      onDelete(message.id);
      toast.success(`Step ${index + 1} deleted`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      {/* Connector from previous card */}
      {index > 0 && (
        <div className="flex items-center gap-2 py-1 ml-10">
          <div className="h-5 w-px bg-slate-200" />
          <span className="text-xs italic text-slate-400">
            wait {message.delayDays} day
            {message.delayDays !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div
        className={`flex items-start gap-3 rounded-2xl border bg-white p-4 transition-shadow ${
          isDragging ? "border-teal-200 shadow-xl" : "border-slate-200"
        }`}
      >
        <DragHandle {...attributes} {...listeners} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 ring-1 ring-teal-100">
              {index + 1}
            </span>
            <span className="text-xs text-slate-400">
              Variant {message.variantGroup}
            </span>
            <span className="text-xs text-slate-400">-</span>
            <span className="text-xs text-slate-400">
              {index === 0 || message.delayDays === 0
                ? "immediately"
                : `after ${message.delayDays} day${message.delayDays !== 1 ? "s" : ""}`}
            </span>
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap font-mono text-sm text-slate-700">
            {showSubject && message.subjectTemplate ? `${message.subjectTemplate}\n` : ""}
            {message.bodyTemplate}
          </p>
        </div>

        <div className="flex gap-2 shrink-0 pt-0.5">
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs font-semibold text-red-500 hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      {editing && (
        <EditForm
          message={message}
          campaignId={campaignId}
          showSubject={showSubject}
          onSave={(updated) => {
            onUpdate(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// Add step form

function AddStepForm({
  campaignId,
  nextOrder,
  showSubject,
  onAdded,
  onClose,
}: {
  campaignId: string;
  nextOrder: number;
  showSubject: boolean;
  onAdded: (msg: Message) => void;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("Hi {{firstName}}");
  const [body, setBody] = useState("");
  const [variant, setVariant] = useState("A");
  const [delay, setDelay] = useState(nextOrder === 0 ? 0 : 3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const msg = await api.campaigns.messages.create(campaignId, {
        sequenceOrder: nextOrder,
        subjectTemplate: showSubject ? subject || null : null,
        bodyTemplate: body,
        variantGroup: variant,
        delayDays: delay,
      });
      onAdded(msg);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4"
    >
      <h3 className="text-sm font-semibold text-teal-900">
        Add Step {nextOrder + 1}
      </h3>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Variant
          </label>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            className="field w-16"
          />
        </div>
        {nextOrder > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Delay (days after previous step)
            </label>
            <input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              className="field w-24"
            />
          </div>
        )}
      </div>
      <div>
        {showSubject && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              InMail subject
            </label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="field w-full font-mono"
              placeholder="Hi {{firstName}}"
            />
          </div>
        )}
        <label className="mb-1 block text-xs font-semibold text-slate-500">
          Message body - must include &gt;= 2 of:{" "}
          <code className="rounded bg-slate-200 px-1 text-xs">
            {"{{firstName}} {{lastName}} {{company}} {{title}} {{postExcerpt}} {{postTopic}} {{postDate}}"}
          </code>
        </label>
        <textarea
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field w-full font-mono"
          placeholder={"Hi {{firstName}},\n\nI noticed you work at {{company}}..."}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-4 py-1.5"
        >
          {saving ? "Adding..." : "Add Step"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Main builder

interface SequenceBuilderProps {
  campaignId: string;
  initialMessages: Message[];
  showSubject?: boolean;
}

export function SequenceBuilder({
  campaignId,
  initialMessages,
  showSubject = false,
}: SequenceBuilderProps) {
  const [messages, setMessages] = useState<Message[]>(
    [...initialMessages].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = messages.findIndex((m) => m.id === active.id);
    const newIndex = messages.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(messages, oldIndex, newIndex).map((m, i) => ({
      ...m,
      sequenceOrder: i,
    }));

    setMessages(reordered);
    setReordering(true);
    try {
      await api.campaigns.messages.reorder(
        campaignId,
        reordered.map((m) => m.id)
      );
    } catch (e) {
      toast.error(`Reorder failed: ${(e as Error).message}`);
      // Revert on failure
      setMessages([...initialMessages].sort((a, b) => a.sequenceOrder - b.sequenceOrder));
    } finally {
      setReordering(false);
    }
  }

  function handleUpdate(updated: Message) {
    setMessages((prev) =>
      prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
    );
  }

  function handleDelete(id: string) {
    setMessages((prev) =>
      prev
        .filter((m) => m.id !== id)
        .map((m, i) => ({ ...m, sequenceOrder: i }))
    );
  }

  function handleAdded(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  if (messages.length === 0 && !showAddForm) {
    return (
      <div className="app-panel border-dashed p-8 text-center">
        <p className="mb-3 text-sm text-slate-500">No steps yet.</p>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary"
        >
          + Add First Step
        </button>
      </div>
    );
  }

  return (
    <div>
      {reordering && (
        <p className="mb-2 text-xs text-slate-400">Saving order...</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={messages.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0">
            {messages.map((msg, i) => (
              <SortableCard
                key={msg.id}
                message={msg}
                index={i}
                campaignId={campaignId}
                showSubject={showSubject}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {showAddForm ? (
        <AddStepForm
          campaignId={campaignId}
          nextOrder={messages.length}
          showSubject={showSubject}
          onAdded={handleAdded}
          onClose={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-3 w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-400 transition-colors hover:border-teal-300 hover:text-teal-600"
        >
          + Add Step
        </button>
      )}
    </div>
  );
}
