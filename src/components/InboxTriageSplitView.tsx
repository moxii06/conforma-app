"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Paperclip, FileText } from "lucide-react";
import { Avatar, initialsOf } from "@/components/ui";
import { InboxMessageActions } from "@/components/InboxMessageActions";
import { AssignEmailSelect } from "@/components/AssignEmailSelect";

type Attachment = { id: string; fileName: string; fileSizeBytes: number };
type Contact = { id: string; firstName: string; lastName: string; email: string };
type Member = { id: string; name: string };
type Message = {
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string;
  snippet: string;
  body: string | null;
  receivedAt: Date;
  externalThreadId: string | null;
  assignedToUserId: string | null;
  attachments: Attachment[];
};

// Marketing/automated senders — a purely visual de-emphasis in the list
// (muted text), never a filter: staff still sees and can act on every
// message, it just doesn't fight the eye for attention against a real
// prospect's email sitting right above or below it.
const AUTOMATED_SENDER_RE = /^(no-?reply|donotreply|notifications?|newsletter|marketing)@|@(newsletter|emailing)\./i;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Groups by externalThreadId (falling back to the message's own id, so an
// unthreaded message is its own group of one) and sorts each group
// newest-first — the primary row shown in the list is always the latest
// message in its thread, with any earlier ones nested underneath it.
function groupByThread(messages: Message[]): Message[][] {
  const groups = new Map<string, Message[]>();
  for (const m of messages) {
    const key = m.externalThreadId ?? m.id;
    const group = groups.get(key);
    if (group) group.push(m);
    else groups.set(key, [m]);
  }
  return Array.from(groups.values())
    .map((g) => g.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()))
    .sort((a, b) => b[0].receivedAt.getTime() - a[0].receivedAt.getTime());
}

export function InboxTriageSplitView({
  messages,
  contacts,
  members,
  canWrite,
}: {
  messages: Message[];
  contacts: Contact[];
  members: Member[];
  canWrite: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(messages[0]?.id ?? null);

  // A rattachement/ignorer action refreshes the parent server component,
  // which drops the acted-on message from `messages` — fall back to
  // whatever is now first rather than leaving the detail pane pointed at a
  // message that no longer exists in the list.
  useEffect(() => {
    if (!messages.some((m) => m.id === selectedId)) {
      setSelectedId(messages[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const threads = groupByThread(messages);

  return (
    <div className="bg-white border border-line rounded-card flex overflow-hidden">
      <div className="w-[260px] border-r border-line shrink-0 overflow-y-auto" style={{ maxHeight: 640 }}>
        {threads.map((thread) => {
          const [latest, ...earlier] = thread;
          return (
            <div key={latest.externalThreadId ?? latest.id}>
              <ThreadRow message={latest} active={latest.id === selectedId} onSelect={() => setSelectedId(latest.id)} threadCount={thread.length} />
              {earlier.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`block w-full text-left pl-7 pr-3.5 py-1.5 border-t border-line text-[11px] truncate ${
                    m.id === selectedId ? "bg-linen text-ink font-medium" : "text-slate hover:bg-mist"
                  }`}
                >
                  {format(m.receivedAt, "d MMM", { locale: fr })} — {m.subject}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 p-5 overflow-y-auto" style={{ maxHeight: 640 }}>
        {!selected ? (
          <div className="text-[12.5px] text-slate">Sélectionnez un message.</div>
        ) : (
          <div key={selected.id} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar initials={initialsOf(selected.fromName ?? selected.fromAddress)} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">{selected.fromName || selected.fromAddress}</div>
                  <div className="text-[11.5px] text-slate truncate">{selected.fromAddress}</div>
                </div>
              </div>
              <div className="text-[11px] text-slate shrink-0">{format(selected.receivedAt, "d MMM yyyy HH:mm", { locale: fr })}</div>
            </div>

            <div className="font-display text-[16px] text-ink">{selected.subject}</div>

            <div className="text-[12.5px] text-ink leading-relaxed whitespace-pre-wrap">{selected.body || selected.snippet}</div>

            {selected.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/inbox/attachments/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center gap-2 bg-linen border border-line rounded-md px-2.5 py-1.5 text-[11.5px] text-ink hover:border-seal"
                  >
                    <FileText size={14} className="text-rust shrink-0" />
                    {a.fileName}
                    <span className="text-slate">{formatSize(a.fileSizeBytes)}</span>
                  </a>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap border-t border-line pt-3">
              {canWrite && <InboxMessageActions messageId={selected.id} contacts={contacts} fromName={selected.fromName} />}
              {canWrite && (
                <AssignEmailSelect messageId={selected.id} members={members} assignedToUserId={selected.assignedToUserId} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  message,
  active,
  threadCount,
  onSelect,
}: {
  message: Message;
  active: boolean;
  threadCount: number;
  onSelect: () => void;
}) {
  const automated = AUTOMATED_SENDER_RE.test(message.fromAddress);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full text-left px-3.5 py-2.5 border-t border-line first:border-t-0 ${
        active ? "bg-linen border-l-2 border-l-seal" : "border-l-2 border-l-transparent hover:bg-mist"
      }`}
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] truncate ${automated ? "font-medium text-slate" : "font-semibold text-ink"}`}>
          {message.fromName || message.fromAddress}
        </span>
        <span className={`text-[10.5px] shrink-0 ${automated ? "text-ash" : "text-slate"}`}>
          {format(message.receivedAt, "d MMM", { locale: fr })}
        </span>
      </div>
      <div className={`text-[11.5px] truncate mt-0.5 flex items-center gap-1 ${automated ? "text-ash" : "text-ink"}`}>
        {message.attachments.length > 0 && <Paperclip size={11} className="shrink-0 text-seal" />}
        {message.subject}
        {threadCount > 1 && <span className="text-ash shrink-0">· {threadCount}</span>}
      </div>
    </button>
  );
}
