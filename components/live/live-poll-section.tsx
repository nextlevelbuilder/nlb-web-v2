import Link from "next/link";
import type { LivePollRoundView } from "@/lib/live/poll-read-models";
import { getLiveCopy } from "@/lib/live/live-copy";
import { localizedPath } from "@/lib/seo";
import { LiveEmptyPlate } from "./live-empty-plate";
import { SectionHead } from "./live-section-head";
import { LiveTimeLeft } from "./live-time-left";
import { LiveVoteForm, type LiveVoteGroup } from "./live-vote-form";
import { formatLiveDateTimeLine, groupRoundTopics, type LiveViewer, type TopicGroupInfo } from "./live-ui-helpers";

interface LivePollSectionProps {
  round: LivePollRoundView | null;
  groupOf: ReadonlyMap<string, TopicGroupInfo>;
  viewer: LiveViewer | null;
  locale: string;
}

/**
 * The weekly vote: an open round takes votes (signed-in, verified members); a scheduled round shows
 * when it opens; a closed or finalized round shows the tallies the read model exposes, with the
 * winner badge once finalized. Counts are never shown while a round is open.
 */
export function LivePollSection({ round, groupOf, viewer, locale }: LivePollSectionProps) {
  const copy = getLiveCopy(locale);
  const headingId = "live-vote-heading";

  if (!round) {
    return (
      <section className="live-section" aria-labelledby={headingId}>
        <SectionHead id={headingId} label={copy.voteLabel} title={copy.voteHeading} />
        <LiveEmptyPlate kicker={copy.noRoundKicker} title={copy.noRoundTitle} body={copy.noRoundBody} />
      </section>
    );
  }

  const vi = locale === "vi";
  const roundTitle = vi ? round.titleVi : round.titleEn;
  const topics = round.topics.map((t) => ({ id: t.id, title: vi ? t.titleVi : t.titleEn, summary: vi ? t.summaryVi : t.summaryEn }));
  const groups: LiveVoteGroup[] = groupRoundTopics(topics, groupOf).map((g) => ({ title: g.group?.title ?? null, topics: g.topics }));
  const callback = encodeURIComponent(`${localizedPath("/live", locale)}#vote`);
  const signInHref = `${localizedPath("/sign-in", locale)}?callbackUrl=${callback}`;
  const closes = formatLiveDateTimeLine(round.closesAt, locale, round.timezone);

  let schedule: React.ReactNode;
  if (round.status === "open") {
    schedule = (
      <>
        <time dateTime={round.closesAt.toISOString()}>{copy.closesAt(closes)}</time>
        <LiveTimeLeft target={round.closesAt.toISOString()} locale={locale} />
      </>
    );
  } else if (round.status === "scheduled") {
    schedule = <time dateTime={round.opensAt.toISOString()}>{copy.opensAt(formatLiveDateTimeLine(round.opensAt, locale, round.timezone))}</time>;
  } else {
    schedule = <time dateTime={round.closesAt.toISOString()}>{copy.closedAt(closes)}</time>;
  }

  return (
    <section className="live-section" id="vote" aria-labelledby={headingId}>
      <SectionHead id={headingId} label={copy.voteLabel} title={copy.voteHeading} />
      <div className="surface live-poll">
        <header className="live-poll-head">
          <p className="mono live-poll-meta">
            <span className={`live-status live-round-${round.status}`}>{copy.roundStatus[round.status]}</span>
            <span>{roundTitle}</span>
          </p>
          <p className="live-poll-schedule">{schedule}</p>
          {round.status === "open" && <p className="live-note">{copy.voteIntro}</p>}
        </header>

        {round.status === "open" && <OpenRoundBody round={round} groups={groups} viewer={viewer} locale={locale} signInHref={signInHref} />}
        {round.status === "scheduled" && <TopicPreview groups={groups} ungrouped={copy.ungrouped} />}
        {(round.status === "closed" || round.status === "finalized") && <RoundResults round={round} topics={topics} locale={locale} />}
      </div>
    </section>
  );
}

function OpenRoundBody({ round, groups, viewer, locale, signInHref }: {
  round: LivePollRoundView;
  groups: LiveVoteGroup[];
  viewer: LiveViewer | null;
  locale: string;
  signInHref: string;
}) {
  const copy = getLiveCopy(locale);
  if (viewer && viewer.emailVerified) {
    return <LiveVoteForm roundId={round.id} locale={locale} groups={groups} initialTopicId={round.myVoteTopicId} signInHref={signInHref} />;
  }
  return (
    <>
      <TopicPreview groups={groups} ungrouped={copy.ungrouped} />
      <div className="live-vote-gate">
        {viewer ? (
          <p className="live-note live-note-strong">{copy.verifyEmailToVote}</p>
        ) : (
          <>
            <Link className="btn btn-primary live-cta-btn" href={signInHref}>{copy.signInToVote}</Link>
            <p className="live-note">{copy.signInToVoteBody}</p>
          </>
        )}
        <p className="live-note">{copy.votesHidden}</p>
      </div>
    </>
  );
}

/** Read-only topic list (scheduled round, or a viewer who cannot vote yet). */
function TopicPreview({ groups, ungrouped }: { groups: LiveVoteGroup[]; ungrouped: string }) {
  return (
    <div className="live-topic-preview">
      {groups.map((group, index) => (
        <div key={group.title ?? `ungrouped-${index}`} className="live-topic-group">
          <h3 className="mono live-topic-group-title">{group.title ?? ungrouped}</h3>
          <ul className="live-topic-list">
            {group.topics.map((topic) => (
              <li key={topic.id} className="live-topic is-static">
                <span className="live-topic-text">
                  <span className="live-topic-title">{topic.title}</span>
                  {topic.summary && <span className="live-topic-summary">{topic.summary}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RoundResults({ round, topics, locale }: {
  round: LivePollRoundView;
  topics: Array<{ id: string; title: string; summary: string }>;
  locale: string;
}) {
  const copy = getLiveCopy(locale);
  const byId = new Map(topics.map((t) => [t.id, t]));
  const tallies = round.talliesVisible && round.tallies ? round.tallies : null;
  const total = round.totalVotes ?? 0;
  return (
    <div className="live-results">
      {round.status === "closed" && <p className="live-note">{copy.resultsPending}</p>}
      {tallies && (
        <>
          <ol className="live-tally-list">
            {tallies.map((tally) => {
              const topic = byId.get(tally.topicId);
              if (!topic) return null;
              const share = total > 0 ? Math.round((tally.votes / total) * 100) : 0;
              const isWinner = round.winnerTopicId === tally.topicId;
              const isMine = round.myVoteTopicId === tally.topicId;
              return (
                <li key={tally.topicId} className={`live-tally${isWinner ? " is-winner" : ""}`}>
                  <div className="live-tally-row">
                    <span className="live-topic-title">
                      {topic.title}
                      {isWinner && <span className="badge live-winner">{copy.winner}</span>}
                      {isMine && <span className="badge live-your-vote">{copy.yourVote}</span>}
                    </span>
                    <span className="mono live-tally-count">{copy.votes(tally.votes)}</span>
                  </div>
                  <span className="live-tally-bar" aria-hidden="true"><span style={{ transform: `scaleX(${share / 100})` }} /></span>
                </li>
              );
            })}
          </ol>
          <p className="mono live-tally-total">{copy.totalVotes(total)}</p>
        </>
      )}
    </div>
  );
}
