"use client";

import { useId, useState, type FormEvent } from "react";
import { getLiveCopy } from "@/lib/live/live-copy";
import { liveApi } from "./live-api-client";

export interface LiveVoteTopic {
  id: string;
  title: string;
  summary: string;
}

export interface LiveVoteGroup {
  /** Null for topics outside any known group. */
  title: string | null;
  topics: LiveVoteTopic[];
}

type Feedback = { tone: "ok" | "error"; text: string } | null;

/**
 * Radio-style vote for the open round. One vote per member; submitting a different topic changes the
 * vote until the round closes (`POST /api/v1/live/polls/{roundId}/vote`). Feedback is announced
 * through a polite live region.
 */
export function LiveVoteForm({ roundId, locale, groups, initialTopicId, signInHref }: {
  roundId: string;
  locale: string;
  groups: LiveVoteGroup[];
  initialTopicId: string | null;
  signInHref: string;
}) {
  const copy = getLiveCopy(locale);
  const name = useId();
  const [selected, setSelected] = useState<string | null>(initialTopicId);
  const [saved, setSaved] = useState<string | null>(initialTopicId);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending || selected === saved) return;
    setPending(true);
    setFeedback({ tone: "ok", text: copy.voteSaving });
    const result = await liveApi<{ topicId?: unknown; changed?: unknown }>(`/api/v1/live/polls/${encodeURIComponent(roundId)}/vote`, {
      method: "POST",
      body: JSON.stringify({ topicId: selected }),
    });
    setPending(false);
    if (result.ok) {
      const topicId = typeof result.data.topicId === "string" ? result.data.topicId : selected;
      const changed = result.data.changed === true || (saved !== null && saved !== topicId);
      setSaved(topicId);
      setSelected(topicId);
      setFeedback({ tone: "ok", text: changed ? copy.voteChanged : copy.voteSaved });
      return;
    }
    if (result.code === "unauthenticated") {
      window.location.assign(signInHref);
      return;
    }
    setFeedback({ tone: "error", text: copy.errors[result.code] });
  }

  return (
    <form className="live-vote-form" onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <fieldset className="live-vote-fieldset">
        <legend className="sr-only">{copy.voteLegend}</legend>
        {groups.map((group, groupIndex) => (
          <div key={group.title ?? `ungrouped-${groupIndex}`} className="live-topic-group" role="group" aria-labelledby={`${name}-g${groupIndex}`}>
            <h3 id={`${name}-g${groupIndex}`} className="mono live-topic-group-title">{group.title ?? copy.ungrouped}</h3>
            <ul className="live-topic-list">
              {group.topics.map((topic) => {
                const inputId = `${name}-${topic.id}`;
                return (
                  <li key={topic.id}>
                    <input
                      className="live-topic-radio"
                      type="radio"
                      id={inputId}
                      name={name}
                      value={topic.id}
                      checked={selected === topic.id}
                      onChange={() => {
                        setSelected(topic.id);
                        setFeedback(null);
                      }}
                      aria-describedby={topic.summary ? `${inputId}-s` : undefined}
                    />
                    <label htmlFor={inputId} className="live-topic">
                      <span className="live-topic-mark" aria-hidden="true" />
                      <span className="live-topic-text">
                        <span className="live-topic-title">
                          {topic.title}
                          {saved === topic.id && <span className="badge live-your-vote">{copy.yourVote}</span>}
                        </span>
                        {topic.summary && <span id={`${inputId}-s`} className="live-topic-summary">{topic.summary}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </fieldset>
      <div className="live-vote-actions">
        <button type="submit" className="btn btn-primary live-cta-btn" disabled={!selected || pending || selected === saved}>
          {saved ? copy.voteChange : copy.voteSubmit}
        </button>
        <p className={`live-feedback${feedback?.tone === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          {feedback?.text}
        </p>
      </div>
    </form>
  );
}
