import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Clock3, ArrowRight } from 'lucide-react';
import { demoEvents } from '../data';
import { api, isDemo } from '../lib';
import { areas, dateParts, yen, type EventData } from '../types';
export function useEvents(id?: string) {
  const [events, setEvents] = useState<EventData[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (isDemo
      ? Promise.resolve(id ? demoEvents.filter((e) => e.id === id) : demoEvents)
      : api<EventData[] | EventData>(id ? `/events/${id}` : '/events').then((v) =>
          Array.isArray(v) ? v : [v],
        )
    )
      .then((v) => {
        if (active) setEvents(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return { events, loading, error, retry: () => setAttempt((v) => v + 1) };
}
export function EventStatus({ remaining }: { remaining: number }) {
  return (
    <span className={`availability ${remaining === 0 ? 'full' : remaining <= 4 ? 'few' : ''}`}>
      {remaining === 0 ? '受付終了' : remaining <= 4 ? `残り${remaining}席` : '受付中'}
    </span>
  );
}
export function EventCard({ event: e }: { event: EventData }) {
  const d = dateParts(e.startsAt);
  return (
    <article className="event-card">
      <Link className="event-image" to={`/events/${e.id}`} tabIndex={-1} aria-hidden="true">
        <img src={e.image || '/images/hero.png'} alt="" loading="lazy" />
        <span className="image-tag">{e.tag || '交流イベント'}</span>
        <span className="image-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="event-card-body">
        <div className="event-date">
          <span className="date-number">
            {d.month}
            <i>/</i>
            {d.day}
          </span>
          <span className="date-day">
            {d.weekday}
            <small>{d.time}〜</small>
          </span>
          <span className="area-label">
            <MapPin size={13} />
            {areas[e.area]}
          </span>
        </div>
        <h3>
          <Link to={`/events/${e.id}`}>{e.title}</Link>
        </h3>
        <p className="venue-text">{e.venue}</p>
        <div className="event-meta">
          <span>
            {e.minAge}〜{e.maxAge}歳
          </span>
          <span>{e.alcohol ? '食事・飲み放題付き' : 'ノンアルコール'}</span>
        </div>
        <div className="price-line">
          <span>男性</span>
          <strong>{yen(e.malePrice)}</strong>
          <EventStatus remaining={e.maleRemaining} />
        </div>
        <div className="price-line">
          <span>女性</span>
          <strong>{yen(e.femalePrice)}</strong>
          <EventStatus remaining={e.femaleRemaining} />
        </div>
        <Link className="card-link" to={`/events/${e.id}`}>
          詳細・お申し込み
          <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        イベントを読み込んでいます
      </div>
    );
  if (error)
    return (
      <div className="empty-state" role="alert">
        <p>{error}</p>
        <button className="button outline" onClick={retry}>
          再読み込み
        </button>
      </div>
    );
  return null;
}
export function EventSummary({ event: e }: { event: EventData }) {
  return (
    <div className="summary-event">
      <img src={e.image || '/images/hero.png'} alt="" />
      <div>
        <span className="eyebrow">{areas[e.area]}</span>
        <h3>{e.title}</h3>
        <p>
          <Clock3 size={15} />
          {dateParts(e.startsAt).month}月{dateParts(e.startsAt).day}日（
          {dateParts(e.startsAt).weekday}）{dateParts(e.startsAt).time}〜
        </p>
        <p>
          <MapPin size={15} />
          {e.venue}
        </p>
      </div>
    </div>
  );
}
